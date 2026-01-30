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
            const children = jsxElement.children;
            const currentlyUnderText = TEXT_COMPONENTS.includes(tagName) || isUnderText;

            children.forEach(child => checkNode(child, currentlyUnderText));
        } else if (ts.isJsxSelfClosingElement(node)) {
            // Self-closing elements can't have children, but might have attributes (irrelevant for this check)
        } else if (ts.isJsxText(node)) {
            const text = node.getText(sourceFile).trim();
            if (text.length > 0 && !isUnderText) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                console.error(`\x1b[31m[LINT ERROR]\x1b[0m ${filePath}:${line + 1}:${character + 1}: Raw text outside of <text> component: "${text}"`);
                errorCount++;
            }
        } else if (ts.isJsxExpression(node)) {
            const jsxExpr = node as ts.JsxExpression;
            // Expressions like {someVar} or {"string"}
            if (jsxExpr.expression && !isUnderText) {
                const expr = jsxExpr.expression;

                function isPotentiallyText(e: ts.Expression): boolean {
                    if (ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isTemplateLiteral(e)) return true;
                    if (ts.isBinaryExpression(e)) {
                        // String concatenation
                        if (e.operatorToken.kind === ts.SyntaxKind.PlusToken) return true;
                        // Logical operators - check branches
                        if (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                            e.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
                            e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
                            return isPotentiallyText(e.left) || isPotentiallyText(e.right);
                        }
                    }
                    if (ts.isConditionalExpression(e)) {
                        return isPotentiallyText(e.whenTrue) || isPotentiallyText(e.whenFalse);
                    }
                    // We can't easily know for general identifiers/calls without full type checking,
                    // but we can at least avoid flagging things that are clearly JSX.
                    if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return false;

                    // For identifiers like {authStatus}, if it's outside <text>, it's risky but 
                    // we don't want too many false positives. However, since this is a 
                    // TUI-specific linter, we should probably be strict.
                    // But for now, let's target the most obvious ones.
                    return false;
                }

                if (isPotentiallyText(expr)) {
                    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                    console.error(`\x1b[31m[LINT ERROR]\x1b[0m ${filePath}:${line + 1}:${character + 1}: Expression evaluated to text outside of <text> component.`);
                    errorCount++;
                }
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

console.log("\x1b[34m[TUI LINTER]\x1b[0m Scanning for raw text nodes...");
walkDir(srcDir);

if (errorCount > 0) {
    console.error(`\n\x1b[31m[FAILED]\x1b[0m Found ${errorCount} rogue text nodes. OpenTUI requires all text to be inside a <text> component.`);
    process.exit(1);
} else {
    console.log("\n\x1b[32m[PASSED]\x1b[0m No rogue text nodes found.");
    process.exit(0);
}
