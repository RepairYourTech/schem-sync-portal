export default {
    meta: {
        type: "problem",
        docs: {
            description: "Enforce that all JSX text and expressions are wrapped in a <text> component for OpenTUI compatibility.",
            category: "Possible Errors",
            recommended: true,
        },
        schema: [], // no options
    },
    create(context) {
        function isTextComponent(node) {
            return (
                node &&
                node.type === "JSXOpeningElement" &&
                node.name.type === "JSXIdentifier" &&
                node.name.name === "text"
            );
        }

        function isInsideText(node) {
            let parent = node.parent;
            while (parent) {
                if (parent.type === "JSXElement" && isTextComponent(parent.openingElement)) {
                    return true;
                }
                parent = parent.parent;
            }
            return false;
        }

        return {
            JSXText(node) {
                if (node.value.trim().length > 0 && !isInsideText(node)) {
                    context.report({
                        node,
                        message: "Raw text must be wrapped in a <text> component.",
                    });
                }
            },
            JSXExpressionContainer(node) {
                // Only check expressions that are children of JSX elements, not attributes
                if (node.parent.type !== "JSXElement" && node.parent.type !== "JSXFragment") return;

                // We only care about expressions that evaluate to content (strings, numbers, etc.)
                const expr = node.expression;
                if (!expr || isInsideText(node)) return;

                // Skip if the expression itself is a JSX element (conditional rendering)
                if (expr.type === "JSXElement" || expr.type === "JSXFragment" || expr.type === "JSXSelfClosingElement") return;

                // If it's a logical expression, it might be {condition && <Box />}. 
                // We only want to flag if it's {condition && "string"} or {condition ? "string" : <Box />}.
                // This is a bit complex for a simple rule, but we'll flag obvious text literals.
                function containsDirectText(e) {
                    if (e.type === "Literal" && typeof e.value === "string" && e.value.trim().length > 0) return true;
                    if (e.type === "TemplateLiteral") return true;
                    if (e.type === "BinaryExpression" && e.operator === "+") return true;
                    if (e.type === "LogicalExpression") return containsDirectText(e.left) || containsDirectText(e.right);
                    if (e.type === "ConditionalExpression") return containsDirectText(e.consequent) || containsDirectText(e.alternate);
                    return false;
                }

                if (containsDirectText(expr)) {
                    context.report({
                        node,
                        message: "Expressions evaluated to text must be wrapped in a <text> component.",
                    });
                }
            },
        };
    },
};
