/** Installed-engine workflows. Interactive instructions stay project-owned. */
export const isMemoryFlow = id => id === 'mb-init' || id === 'mb-upgrade';
export const isDiagnosticFlow = id => id === 'mb-audit' || id === 'project-review';
export const isSourceSnapshotFlow = id => isDiagnosticFlow(id) || id === 'mb-distill';
export const isInstalledFlow = id => isMemoryFlow(id) || isSourceSnapshotFlow(id) || id === 'interactive';
export const installedSelectionKeys = Object.freeze(['memory_init', 'memory_upgrade', 'diagnostic', 'distillation', 'interactive']);
export const installedProfileSelection = subject => subject.interactive ?? subject.distillation ?? subject.diagnostic ?? subject.memory_upgrade ?? subject.memory_init;
