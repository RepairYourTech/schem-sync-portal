/** @jsxImportSource @opentui/react */
import React from "react";
import { WizardContainer } from "./wizard/WizardContainer";
import type { WizardProps } from "./wizard/types";

/**
 * Wizard Component
 * 
 * A thin wrapper around WizardContainer. 
 * Orchestration and state are now modularized in the wizard/ directory.
 */
export const Wizard = (props: WizardProps) => {
    return <WizardContainer {...props} />;
};

Wizard.displayName = "Wizard";
