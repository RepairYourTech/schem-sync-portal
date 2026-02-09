import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const projectRoot = process.cwd();
const srcDir = join(projectRoot, "src");

// Allowed components that can contain raw text
// In OpenTUI, ONLY <text> can contain raw text.
const TEXT_COMPONENTS = ["text"];

// Text modifiers that MUST be inside <text>
const TEXT_MODIFIERS = ["span", "strong", "em", "u", "b", "i"];

// HTML elements that should never be used in OpenTUI
const HTML_ELEMENTS = ["div", "button", "p", "a", "img", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "li", "ol", "table", "tr", "td", "th", "form", "label", "section", "header", "footer", "nav", "main", "article", "aside"];

let errorCount = 0;

function reportError(filePath: string, sourceFile: ts.SourceFile, node: ts.Node, message: string) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    console.error(`\x1b[31m[LINT ERROR]\x1b[0m ${filePath}:${line + 1}:${character + 1}: ${message}`);
    errorCount++;
}

function lintFile(filePath: string) {
    const sourceCode = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    function checkNode(node: ts.Node, isUnderText: boolean) {
        if (ts.isJsxElement(node)) {
            const jsxElement = node as ts.JsxElement;
            const tagName = jsxElement.openingElement.tagName.getText(sourceFile);

            // Rule 3: No nested <text> inside <text>
            if (tagName === "text" && isUnderText) {
                reportError(filePath, sourceFile, node, `Nested <text> inside <text> is illegal. Use <span> for inline styling.`);
            }

            // Rule 4: Text modifiers must be inside <text>
            if (TEXT_MODIFIERS.includes(tagName) && !isUnderText) {
                reportError(filePath, sourceFile, node, `<${tagName}> must be inside a <text> component. Text modifiers don't work in <box>.`);
            }

            // Rule 5: No HTML elements
            if (HTML_ELEMENTS.includes(tagName)) {
                reportError(filePath, sourceFile, node, `<${tagName}> is an HTML element, not an OpenTUI element. Use <box>/<text> instead.`);
            }

            const currentlyUnderText = TEXT_COMPONENTS.includes(tagName) || isUnderText;
            jsxElement.children.forEach(child => checkNode(child, currentlyUnderText));
        } else if (ts.isJsxSelfClosingElement(node)) {
            const tagName = node.tagName.getText(sourceFile);

            // Rule 4: Text modifiers must be inside <text> (self-closing)
            if (TEXT_MODIFIERS.includes(tagName) && !isUnderText) {
                reportError(filePath, sourceFile, node, `<${tagName}> must be inside a <text> component.`);
            }

            // Rule 5: No HTML elements (self-closing)
            if (HTML_ELEMENTS.includes(tagName)) {
                reportError(filePath, sourceFile, node, `<${tagName}> is an HTML element, not an OpenTUI element. Use <box>/<text> instead.`);
            }

            // Rule 8: Uncontrolled inputs - <input> must have value prop
            if (tagName === "input") {
                const hasValue = node.attributes.properties.some(attr => {
                    if (ts.isJsxAttribute(attr)) {
                        const attrName = attr.name.getText(sourceFile);
                        return attrName === "value";
                    }
                    return false;
                });
                if (!hasValue) {
                    reportError(filePath, sourceFile, node, `Uncontrolled <input> detected. Add 'value' prop for controlled input behavior.`);
                }
            }
        } else if (ts.isJsxText(node)) {
            // Rule 1 (existing): Raw text outside <text>
            const text = node.getText(sourceFile).trim();
            if (text.length > 0 && !isUnderText) {
                reportError(filePath, sourceFile, node, `Raw text outside of <text> component: "${text}"`);
            }
        } else if (ts.isJsxExpression(node)) {
            const jsxExpr = node as ts.JsxExpression;
            if (!jsxExpr.expression) return;

            // Skip expressions inside JSX attributes (props) - only check actual children
            if (ts.isJsxAttribute(node.parent)) return;

            // Rule 2 (existing): Numeric leak prevention in logical and conditional expressions

            function isSafeExpression(e: ts.Expression): boolean {
                // Strip parentheses for analysis
                while (ts.isParenthesizedExpression(e)) {
                    e = e.expression;
                }

                // JSX elements are fundamentally safe to render
                if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return true;

                // Literals
                if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return true;
                if (ts.isNumericLiteral(e)) return false; // 0 crashes
                if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return true;
                if (e.kind === ts.SyntaxKind.NullKeyword || e.kind === ts.SyntaxKind.UndefinedKeyword) return true;

                // Template literals
                if (ts.isTemplateExpression(e)) return true;

                // Call expressions
                if (ts.isCallExpression(e)) {
                    const calleeExpr = e.expression;

                    // Check for IIFEs (Immediately Invoked Function Expressions)
                    // Pattern: (() => { ... return <JSX/>; })()
                    let iifeBody: ts.Node | undefined;
                    if (ts.isParenthesizedExpression(calleeExpr)) {
                        const inner = calleeExpr.expression;
                        if (ts.isArrowFunction(inner) && inner.body) {
                            iifeBody = inner.body;
                        } else if (ts.isFunctionExpression(inner) && inner.body) {
                            iifeBody = inner.body;
                        }
                    } else if (ts.isArrowFunction(calleeExpr) && calleeExpr.body) {
                        iifeBody = calleeExpr.body;
                    }

                    if (iifeBody) {
                        // Check if the IIFE body returns JSX
                        if (ts.isJsxElement(iifeBody) || ts.isJsxSelfClosingElement(iifeBody) || ts.isJsxFragment(iifeBody)) {
                            return true; // Arrow function with implicit JSX return
                        }
                        if (ts.isBlock(iifeBody)) {
                            // Check return statements in the block
                            let returnsJsx = false;
                            let returnsArrayOfJsx = false;
                            const arrayVarsWithJsx = new Set<string>();

                            function checkForArrayPush(n: ts.Node) {
                                // Detect pattern: elements.push(<JSX/>)
                                if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
                                    if (n.expression.name.text === "push" && ts.isIdentifier(n.expression.expression)) {
                                        const arrayName = n.expression.expression.text;
                                        for (const arg of n.arguments) {
                                            let a = arg;
                                            while (ts.isParenthesizedExpression(a)) a = a.expression;
                                            if (ts.isJsxElement(a) || ts.isJsxSelfClosingElement(a) || ts.isJsxFragment(a)) {
                                                arrayVarsWithJsx.add(arrayName);
                                            }
                                        }
                                    }
                                }
                                ts.forEachChild(n, checkForArrayPush);
                            }
                            checkForArrayPush(iifeBody);

                            function checkReturns(n: ts.Node) {
                                if (ts.isReturnStatement(n) && n.expression) {
                                    let ret = n.expression;
                                    while (ts.isParenthesizedExpression(ret)) ret = ret.expression;
                                    if (ts.isJsxElement(ret) || ts.isJsxSelfClosingElement(ret) || ts.isJsxFragment(ret)) {
                                        returnsJsx = true;
                                    }
                                    // Check if returning an array that was populated with JSX
                                    if (ts.isIdentifier(ret) && arrayVarsWithJsx.has(ret.text)) {
                                        returnsArrayOfJsx = true;
                                    }
                                }
                                ts.forEachChild(n, checkReturns);
                            }
                            checkReturns(iifeBody);
                            if (returnsJsx || returnsArrayOfJsx) return true;
                        }
                    }

                    const funcName = e.expression.getText(sourceFile);
                    // Whitelist map() as it usually returns a safe array of elements
                    if (funcName.endsWith(".map")) return true;
                    // Whitelist explicit string conversion
                    if (funcName === "String" || funcName.endsWith(".toString")) return true;
                    // Whitelist render functions
                    if (funcName.startsWith("render")) return true;
                    // Whitelist string-returning methods
                    if (funcName.endsWith(".toUpperCase") ||
                        funcName.endsWith(".toLowerCase") ||
                        funcName.endsWith(".substring") ||
                        funcName.endsWith(".slice") ||
                        funcName.endsWith(".trim")) return true;
                    return false;
                }

                // Identifier check
                if (ts.isIdentifier(e)) {
                    const name = e.text;
                    if (name === "children") return true; // React children are safe
                    return false;
                }

                // Logical and Binary expressions
                if (ts.isBinaryExpression(e)) {
                    const op = e.operatorToken.kind;
                    if (op === ts.SyntaxKind.PlusToken) {
                        return isSafeExpression(e.left) || isSafeExpression(e.right);
                    }
                    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
                        // Left side must be a comparison or boolean-ish
                        let left = e.left;
                        while (ts.isParenthesizedExpression(left)) left = left.expression;

                        const isComparison = ts.isBinaryExpression(left) && [
                            ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
                            ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
                            ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanToken,
                            ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.LessThanEqualsToken
                        ].includes(left.operatorToken.kind);

                        const isBoolean = (ts.isPrefixUnaryExpression(left) && left.operator === ts.SyntaxKind.ExclamationToken) ||
                            (left.kind === ts.SyntaxKind.TrueKeyword || left.kind === ts.SyntaxKind.FalseKeyword);

                        const isLogicalNested = ts.isBinaryExpression(left) && left.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;

                        // Whitelist common boolean identifiers
                        const isBooleanIdentifier = ts.isIdentifier(left) && (
                            left.text.startsWith("is") ||
                            left.text.startsWith("has") ||
                            left.text.startsWith("show") ||
                            left.text.endsWith("Enabled") ||
                            left.text === "active" ||
                            left.text === "empty" ||
                            left.text === "complete"
                        );

                        if (!isComparison && !isBoolean && !isLogicalNested && !isBooleanIdentifier) {
                            return false;
                        }
                        return isSafeExpression(e.right);
                    }
                    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
                        return isSafeExpression(e.left) && isSafeExpression(e.right);
                    }
                    // Numeric comparisons (like stats.count > 0) return booleans, which are safe
                    if ([
                        ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
                        ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
                        ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanToken,
                        ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.LessThanEqualsToken
                    ].includes(op)) return true;
                }

                if (ts.isConditionalExpression(e)) {
                    return isSafeExpression(e.whenTrue) && isSafeExpression(e.whenFalse);
                }

                if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
                    return true;
                }

                // If it's a PropertyAccess or Identifier, we can't be sure it's a string.
                // In OpenTUI, we must be sure. So we fail unless it's wrapped.
                return false;
            }

            if (!isSafeExpression(jsxExpr.expression)) {
                const snippet = jsxExpr.expression.getText(sourceFile);
                reportError(filePath, sourceFile, node, `Unsafe JSX child expression: \`{${snippet}}\`. \n  Must be stringified with String() or wrapped in a boolean check (e.g. \`!!(${snippet})\`) to avoid TUI runtime crashes.`);
            }
        } else if (ts.isJsxFragment(node)) {
            const fragment = node as ts.JsxFragment;
            fragment.children.forEach(child => checkNode(child, isUnderText));
        } else if (ts.isReturnStatement(node)) {
            // Rule 6: Explicit null returns (no bare 'return;' in components)
            // Only check inside function-like contexts that look like components
            if (!node.expression) {
                const parent = findParentFunction(node);
                if (parent && isLikelyComponent(parent, sourceFile)) {
                    reportError(filePath, sourceFile, node, `Implicit return (undefined) detected. Use 'return null' explicitly in components.`);
                }
            }
        } else if (ts.isCallExpression(node)) {
            // Rule 7: No process.exit()
            const callText = node.expression.getText(sourceFile);
            if (callText === "process.exit") {
                reportError(filePath, sourceFile, node, `process.exit() leaves terminal in broken state. Use renderer.destroy() instead.`);
            }
        }

        // Continue walking for non-JSX nodes
        if (!ts.isJsxElement(node) && !ts.isJsxFragment(node)) {
            ts.forEachChild(node, (child) => checkNode(child, isUnderText));
        }
    }

    checkNode(sourceFile, false);

    // Rule 9: Check for exported components without displayName
    const exportedComponents: string[] = [];
    const componentsWithDisplayName = new Set<string>();

    function findExportedComponents(node: ts.Node) {
        // Check for: export const ComponentName = ...
        if (ts.isVariableStatement(node)) {
            const hasExport = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
            if (hasExport) {
                for (const decl of node.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name)) {
                        const name = decl.name.text;
                        // Check if it's likely a component (PascalCase and has JSX)
                        if (name.length > 0 && name[0]! === name[0]!.toUpperCase() && decl.initializer) {
                            if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
                                if (isLikelyComponent(decl.initializer, sourceFile)) {
                                    exportedComponents.push(name);
                                }
                            }
                        }
                    }
                }
            }
        }
        // Check for: export function ComponentName() { ... }
        if (ts.isFunctionDeclaration(node) && node.name) {
            const hasExport = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
            if (hasExport) {
                const name = node.name.text;
                if (name.length > 0 && name[0]! === name[0]!.toUpperCase() && isLikelyComponent(node, sourceFile)) {
                    exportedComponents.push(name);
                }
            }
        }
        // Check for ComponentName.displayName = ...
        if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
            const expr = node.expression;
            if (expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                if (ts.isPropertyAccessExpression(expr.left) && expr.left.name.text === "displayName") {
                    if (ts.isIdentifier(expr.left.expression)) {
                        componentsWithDisplayName.add(expr.left.expression.text);
                    }
                }
            }
        }
        ts.forEachChild(node, findExportedComponents);
    }
    findExportedComponents(sourceFile);

    for (const comp of exportedComponents) {
        if (!componentsWithDisplayName.has(comp)) {
            // Find the component declaration to report
            const compNode = findComponentDeclaration(sourceFile, comp);
            if (compNode) {
                reportError(filePath, sourceFile, compNode, `Component '${comp}' is missing displayName. Add: ${comp}.displayName = "${comp}";`);
            }
        }
    }
}

function findComponentDeclaration(sourceFile: ts.SourceFile, name: string): ts.Node | undefined {
    let found: ts.Node | undefined;
    function search(node: ts.Node) {
        if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.name.text === name) {
                    found = node;
                    return;
                }
            }
        }
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
            found = node;
            return;
        }
        ts.forEachChild(node, search);
    }
    search(sourceFile);
    return found;
}

function findParentFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
    let current = node.parent;
    while (current) {
        if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
            return current;
        }
        current = current.parent;
    }
    return undefined;
}

function isLikelyComponent(fn: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): boolean {
    // A component typically returns JSX. Check if function body has JSX returns.
    let hasJsxReturn = false;
    function checkForJsx(node: ts.Node) {
        if (ts.isReturnStatement(node) && node.expression) {
            if (ts.isJsxElement(node.expression) || ts.isJsxSelfClosingElement(node.expression) || ts.isJsxFragment(node.expression)) {
                hasJsxReturn = true;
            }
            // Also check parenthesized JSX
            let expr = node.expression;
            while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
            if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
                hasJsxReturn = true;
            }
        }
        ts.forEachChild(node, checkForJsx);
    }
    if (fn.body) checkForJsx(fn.body);
    return hasJsxReturn;
}

function walkDir(dir: string) {
    const files = readdirSync(dir);
    for (const file of files) {
        const fullPath = join(dir, file);
        if (statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if ([".tsx"].includes(extname(fullPath))) {
            lintFile(fullPath);
        }
    }
}

console.log("\x1b[34m[TUI LINTER]\x1b[0m Scanning for OpenTUI safety violations...");
console.log("\x1b[34m[TUI LINTER]\x1b[0m Rules: raw text, numeric leaks, nested text, modifiers, HTML, null returns, process.exit, inputs, displayName");
walkDir(srcDir);

if (errorCount > 0) {
    console.error(`\n\x1b[31m[FAILED]\x1b[0m Found ${errorCount} safety violations.`);
    process.exit(1);
} else {
    console.log("\n\x1b[32m[PASSED]\x1b[0m No safety violations found.");
    process.exit(0);
}

