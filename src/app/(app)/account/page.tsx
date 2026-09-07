import type { Metadata } from "next";
import { InviteManager } from "@/components/invite-manager";
import { PasswordForm } from "@/components/password-form";
import { ProfileForm } from "@/components/profile-form";
import { SignOutButton } from "@/components/sign-out-button";
import { Pill } from "@/components/ui/pill";
import { requireUser } from "@/lib/current-user";
import { getSeats, listAccounts, listInvites } from "@/server/auth/service";

export const metadata: Metadata = { title: "Account" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-paper-raised p-4">
      <div>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function AccountPage() {
  const user = await requireUser();
  const isOwner = user.role === "owner";
  const [invites, seats, members] = isOwner
    ? await Promise.all([listInvites(), getSeats(), listAccounts()])
    : [[], await getSeats(), []];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Account</h1>
        {isOwner && <Pill tone="accent">Owner</Pill>}
      </div>

      <Section title="You">
        <ProfileForm account={user} />
      </Section>

      <Section title="Password">
        <PasswordForm />
      </Section>

      {isOwner && (
        <>
          <Section title="Invites" description="Only you ever see these codes. Send one to somebody and they can make an account.">
            <InviteManager initialInvites={invites} seats={seats} />
          </Section>

          <Section title="Who's cooking here" description={`${members.length} of ${seats.max} places used.`}>
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{member.name}</p>
                    <p className="truncate text-sm text-ink-muted">{member.email}</p>
                  </div>
                  {member.role === "owner" && <Pill tone="accent">Owner</Pill>}
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      <div className="flex items-center justify-between gap-3 rounded-card border border-line p-4">
        <p className="text-sm text-ink-muted">Signed in as {user.email}.</p>
        <SignOutButton />
      </div>
    </div>
  );
}
