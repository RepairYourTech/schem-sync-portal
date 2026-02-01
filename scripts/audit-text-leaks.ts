import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const projectRoot = process.cwd();
const srcDir = join(projectRoot, "src");

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
            const tagName = node.openingElement.tagName.getText(sourceFile);
            const currentlyUnderText = tagName === "text" || isUnderText;
            node.children.forEach(child => checkNode(child, currentlyUnderText));
        } else if (ts.isJsxExpression(node) && isUnderText) {
            const expr = node.expression;
            if (!expr) return;

            function isExplicitlySafe(e: ts.Expression): boolean {
                while (ts.isParenthesizedExpression(e)) e = e.expression;

                if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) return true;

                if (ts.isCallExpression(e)) {
                    const funcName = e.expression.getText(sourceFile);
                    if (funcName === "String" || funcName.endsWith(".toString")) return true;
                    if (funcName.endsWith(".toUpperCase") || funcName.endsWith(".toLowerCase") || funcName.endsWith(".trim") || funcName.endsWith(".substring") || funcName.endsWith(".slice")) return true;
                }

                // JsX elements are NOT inherently safe inside <text> if they can be null
                if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return false;

                return false;
            }

            if (!isExplicitlySafe(expr)) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                const snippet = expr.getText(sourceFile);
                console.error(`\x1b[31m[CRASH RISK]\x1b[0m ${filePath}:${line + 1}:${character + 1}: Unsafe child in <text>: \`{${snippet}}\`. \n  Must be explicitly stringified with String() or moved outside the <text> component.`);
                errorCount++;
            }
        } else if (ts.isJsxFragment(node)) {
            node.children.forEach(child => checkNode(child, isUnderText));
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

walkDir(srcDir);
process.exit(errorCount > 0 ? 1 : 0);
