import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { getPreset, providersFile } from "@/lib/providers";
import { CredentialsScreen } from "./CredentialsScreen";
import { autofillOf } from "./form-model";
import { UnlockScreen } from "./UnlockScreen";

// What password managers read: autocomplete values, a username beside each passphrase, and real forms.
const noop = () => undefined;
const input = (label: string) => screen.getByLabelText<HTMLInputElement>(label);

describe("autofill", () => {
  it("offers the access key ID as the username and the secret as its password when connecting", () => {
    render(<CredentialsScreen preset={getPreset("custom")} onBack={noop} onSubmit={noop} />);
    expect(input("Access Key ID").autocomplete).toBe("username");
    expect(input("Access Key ID").name).toBe("accessKeyId");
    expect(input("Secret Access Key").autocomplete).toBe("current-password");
    expect(input("Secret Access Key").form).toBe(input("Access Key ID").form);
    expect(input("Secret Access Key").form).not.toBeNull();
  });

  it("offers nothing while a saved connection is edited", () => {
    render(<CredentialsScreen preset={getPreset("custom")} edit={{ connectionId: "c", name: "n", endpoint: "https://s3.example-provider.test" }} onBack={noop} onSubmit={noop} />);
    expect(input("Access Key ID").autocomplete).toBe("off");
    expect(input("Secret Access Key").autocomplete).toBe("new-password");
  });

  it("gives every preset's keys a value that fits their role", () => {
    for (const preset of providersFile.providers) {
      for (const field of preset.fields) {
        const role = field.role ?? field.id;
        if (role === "accessKeyId") expect([preset.id, autofillOf(field, false)]).toEqual([preset.id, "username"]);
        if (role === "secretAccessKey") expect([preset.id, autofillOf(field, false)]).toEqual([preset.id, "current-password"]);
        if (role === "sessionToken") expect(["new-password", "off"]).toContain(autofillOf(field, false));
      }
    }
  });

  it("Unlock asks for the current password of the Coffer account, in a form", async () => {
    const { container } = render(<UnlockScreen reason="start" onUnlocked={vi.fn()} onUseOther={vi.fn()} onNothingSaved={vi.fn()} onStopTransfers={vi.fn()} onForget={() => Promise.resolve()} />);
    const passphrase = input("Passphrase");
    expect(passphrase.autocomplete).toBe("current-password");
    const owner = container.querySelector<HTMLInputElement>('input[autocomplete="username"]');
    expect(owner?.value).toBe("Coffer");
    expect(owner?.form).toBe(passphrase.form);
    expect(passphrase.form).not.toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});
