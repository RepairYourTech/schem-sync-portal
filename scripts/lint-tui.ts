import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const projectRoot = process.cwd();
const srcDir = join(projectRoot, "src");

// Allowed components that can contain raw text
// In OpenTUI, ONLY <text> can contain raw text.
const TEXT_COMPONENTS = ["text"];

let errorCount = 0;

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
            const currentlyUnderText = TEXT_COMPONENTS.includes(tagName) || isUnderText;
            jsxElement.children.forEach(child => checkNode(child, currentlyUnderText));
        } else if (ts.isJsxSelfClosingElement(node)) {
            // Nothing to do
        } else if (ts.isJsxText(node)) {
            const text = node.getText(sourceFile).trim();
            if (text.length > 0 && !isUnderText) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                console.error(`\x1b[31m[LINT ERROR]\x1b[0m ${filePath}:${line + 1}:${character + 1}: Raw text outside of <text> component: "${text}"`);
                errorCount++;
            }
        } else if (ts.isJsxExpression(node)) {
            const jsxExpr = node as ts.JsxExpression;
            if (!jsxExpr.expression) return;

            // Rule 1: Numeric leak prevention in logical and conditional expressions
            // Rule 2: Non-string children must be wrapped

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
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                const snippet = jsxExpr.expression.getText(sourceFile);
                console.error(`\x1b[31m[LINT ERROR]\x1b[0m ${filePath}:${line + 1}:${character + 1}: Unsafe JSX child expression: \`{${snippet}}\`. \n  Must be stringified with String() or wrapped in a boolean check (e.g. \`!!(${snippet})\`) to avoid TUI runtime crashes.`);
                errorCount++;
            }
        } else if (ts.isJsxFragment(node)) {
            const fragment = node as ts.JsxFragment;
            fragment.children.forEach(child => checkNode(child, isUnderText));
        } else {
            ts.forEachChild(node, (child) => checkNode(child, isUnderText));
        }
    }

    checkNode(sourceFile, false);
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

console.log("\x1b[34m[TUI LINTER]\x1b[0m Scanning for raw text nodes and leaked renders...");
walkDir(srcDir);

if (errorCount > 0) {
    console.error(`\n\x1b[31m[FAILED]\x1b[0m Found ${errorCount} safety violations. OpenTUI requires all numeric children to be stringified and logical renders to use boolean checks.`);
    process.exit(1);
} else {
    console.log("\n\x1b[32m[PASSED]\x1b[0m No safety violations found.");
    process.exit(0);
}
