type ConfirmedUserFixture = {
  emailConfirmedAt: Date;
  deletedAt: Date | null;
  isSuperAdmin: boolean;
};

export function makeConfirmedUser(isSuperAdmin = false, overrides: Partial<ConfirmedUserFixture> = {}) {
  return {
    emailConfirmedAt: new Date(),
    deletedAt: null,
    isSuperAdmin,
    ...overrides,
  };
}

type AdminTargetFixture = {
  id: string;
  email: string;
  deletedAt: Date | null;
};

export function makeAdminTarget(overrides: Partial<AdminTargetFixture> = {}) {
  return {
    id: 'target-1',
    email: 'target@example.test',
    deletedAt: null,
    ...overrides,
  };
}
