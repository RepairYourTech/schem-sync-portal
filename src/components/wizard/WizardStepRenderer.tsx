/** @jsxImportSource @opentui/react */
import React from "react";
import type { Step } from "./types";
import type { WizardStepProps } from "./StepProps";

// Steps
import { ShortcutStep } from "./steps/ShortcutStep";
import { CopypartyConfigStep } from "./steps/CopypartyConfigStep";
import { DestCloudSelectStep } from "./steps/DestCloudSelectStep";
import { BackupDirStep } from "./steps/BackupDirStep";
import { SecurityStep } from "./steps/SecurityStep";
import { CloudDirectEntryStep } from "./steps/CloudDirectEntryStep";
import { EditMenuStep } from "./steps/EditMenuStep";
import { DeployStep } from "./steps/DeployStep";

// Shared/Extracted Components
import { SourceChoice } from "./SourceChoice";
import { DirectoryConfig } from "./DirectoryConfig";
import { MirrorSettings } from "./MirrorSettings";
import { UpsyncConfig } from "./UpsyncConfig";

// Specialized Providers
import { GDriveSetup } from "./providers/GDriveSetup";
import { B2Setup } from "./providers/B2Setup";
import { SFTPSetup } from "./providers/SFTPSetup";
import { OneDriveSetup } from "./providers/OneDriveSetup";
import { DropboxSetup } from "./providers/DropboxSetup";
import { MegaSetup } from "./providers/MegaSetup";
import { PCloudSetup } from "./providers/PCloudSetup";
import { R2Setup } from "./providers/R2Setup";
import { S3Setup } from "./providers/S3Setup";

interface WizardStepRendererProps {
    step: Step;
    stepProps: WizardStepProps;
}

export const WizardStepRenderer = React.memo(({ step, stepProps }: WizardStepRendererProps) => {
    switch (step) {
        case "shortcut": return <ShortcutStep {...stepProps} />;
        case "source_choice": return <SourceChoice {...stepProps} />;
        case "copyparty_config": return <CopypartyConfigStep {...stepProps} />;
        case "dir": return <DirectoryConfig {...stepProps} />;
        case "mirror": return <MirrorSettings {...stepProps} />;
        case "upsync_ask": return <UpsyncConfig {...stepProps} />;
        case "dest_cloud_select": return <DestCloudSelectStep {...stepProps} />;
        case "backup_dir": return <BackupDirStep {...stepProps} />;
        case "security": return <SecurityStep {...stepProps} />;

        // Specialized Providers
        case "gdrive_intro":
        case "gdrive_guide_1":
        case "gdrive_guide_2":
        case "gdrive_guide_3":
        case "gdrive_guide_4":
            return <GDriveSetup {...stepProps} />;
        case "b2_intro":
        case "b2_guide_1":
        case "b2_guide_2":
            return <B2Setup {...stepProps} />;
        case "sftp_intro":
        case "sftp_guide_1":
            return <SFTPSetup {...stepProps} />;

        case "onedrive_intro":
        case "onedrive_guide_1":
        case "onedrive_guide_2":
            return <OneDriveSetup {...stepProps} />;

        case "dropbox_intro":
        case "dropbox_guide_1":
        case "dropbox_guide_2":
            return <DropboxSetup {...stepProps} />;

        case "mega_intro":
        case "mega_guide_1":
            return <MegaSetup {...stepProps} />;

        case "pcloud_intro":
        case "pcloud_guide_1":
            return <PCloudSetup {...stepProps} />;

        case "r2_intro":
        case "r2_guide_1":
        case "r2_guide_2":
            return <R2Setup {...stepProps} />;

        case "s3_intro":
        case "s3_guide_1":
        case "s3_guide_2":
            return <S3Setup {...stepProps} />;

        case "cloud_direct_entry": return <CloudDirectEntryStep {...stepProps} />;
        case "edit_menu": return <EditMenuStep {...stepProps} />;
        case "deploy": return <DeployStep {...stepProps} />;
        default: return null;
    }
});

WizardStepRenderer.displayName = "WizardStepRenderer";
