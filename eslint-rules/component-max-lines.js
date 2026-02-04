export default {
    meta: {
        type: "suggestion",
        docs: {
            description: "Enforce a maximum number of lines per component file to maintain modularity",
            category: "Stylistic Issues",
            recommended: false,
        },
        schema: [
            {
                type: "object",
                properties: {
                    max: {
                        type: "integer",
                        minimum: 0,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            exceed: "Component file has too many lines ({{lineCount}}). Maximum allowed is {{max}}.",
        },
    },
    create(context) {
        const maxLines = (context.options[0] && context.options[0].max) || 500;
        const sourceCode = context.getSourceCode();
        const lineCount = sourceCode.lines.length;

        return {
            Program(node) {
                if (lineCount > maxLines) {
                    context.report({
                        node,
                        messageId: "exceed",
                        data: {
                            lineCount,
                            max: maxLines,
                        },
                    });
                }
            },
        };
    },
};
