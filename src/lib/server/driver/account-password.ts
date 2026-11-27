type PasswordState = { revision: string; mustChangePassword: boolean };

type PasswordAuthority = {
  state: (revision: string | null) => Promise<PasswordState>;
  updatePassword: (password: string) => Promise<void>;
};

export async function changeDriverPassword(password: string, authority: PasswordAuthority) {
  const before = await authority.state(null);
  await authority.updatePassword(password);
  return await authority.state(before.revision);
}
