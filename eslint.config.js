import reactPlugin from "eslint-plugin-react";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import noRawText from "./eslint-rules/no-raw-text.js";
import componentMaxLines from "./eslint-rules/component-max-lines.js";

export default [
    {
        files: ["src/**/*.tsx", "src/**/*.ts"],
        plugins: {
            react: reactPlugin,
            "@typescript-eslint": typescriptPlugin,
            "tui-internal": {
                rules: {
                    "no-raw-text": noRawText,
                    "component-max-lines": componentMaxLines,
                },
            },
        },
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                // Add browser/node globals if needed
            },
        },
        rules: {
            ...reactPlugin.configs.recommended.rules,
            ...typescriptPlugin.configs.recommended.rules,
            "react/react-in-jsx-scope": "off", // Not needed in modern React
            "react/prop-types": "off", // Using TypeScript instead
            "react/no-unknown-property": "off", // OpenTUI uses custom props like flexDirection, gap, etc.
            "react/no-unescaped-entities": "off", // Common in TUI text content
            "react/jsx-no-leaked-render": ["error", { "validStrategies": ["ternary", "coerce"] }],
            "@typescript-eslint/no-explicit-any": "warn", // Useful but common in this codebase
            "@typescript-eslint/no-unused-vars": ["warn", {
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_"
            }],
            "@typescript-eslint/no-require-imports": "warn",
            "tui-internal/no-raw-text": "error",
            "tui-internal/component-max-lines": ["error", { "max": 500 }],
        },
        settings: {
            react: {
                version: "detect",
            },
        },
    },
];
