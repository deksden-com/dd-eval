/** Installed-engine workflows. Interactive instructions stay project-owned. */
export const isMemoryFlow = id => id === 'mb-init' || id === 'mb-upgrade';
export const isDiagnosticFlow = id => id === 'mb-audit' || id === 'project-review';
export const isDeliveryFlow = id => ['release', 'deploy', 'publish'].includes(id);
export const isSourceSnapshotFlow = id => isDiagnosticFlow(id) || id === 'mb-distill';
export const isInstalledFlow = id => isMemoryFlow(id) || isSourceSnapshotFlow(id) || isDeliveryFlow(id) || id === 'interactive';
export const installedSelectionKeys = Object.freeze(['memory_init', 'memory_upgrade', 'diagnostic', 'distillation', 'interactive', 'delivery']);
export const installedProfileSelection = subject => subject.delivery ?? subject.interactive ?? subject.distillation ?? subject.diagnostic ?? subject.memory_upgrade ?? subject.memory_init;
