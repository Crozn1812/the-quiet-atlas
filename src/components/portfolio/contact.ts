export function gmailCompose(email: string): string {
  const query = new URLSearchParams({ view: "cm", fs: "1", to: email });
  return `https://mail.google.com/mail/?${query}`;
}
