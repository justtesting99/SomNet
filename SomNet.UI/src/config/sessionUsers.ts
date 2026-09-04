export const CONTROLLER_ROLE = 'Dom';
export const SUB_ROLE = 'Sub';

export const AVAILABLE_SUBS = ['Slv66', 'Slv67', 'Slv68'] as const;

export type SubTargetName = (typeof AVAILABLE_SUBS)[number];

export const DEFAULT_SUB_TARGET: SubTargetName = 'Slv66';
