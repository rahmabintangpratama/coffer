import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPreset } from "@/lib/providers";
import { vault } from "@/lib/storage/vault";
import { CredentialsScreen, type CredentialsSubmit } from "./CredentialsScreen";

const ACCOUNT = "0123456789abcdef0123456789abcdef";

function setup(presetId: string, props: { initialValues?: Record<string, string> } = {}) {
  const onSubmit = vi.fn<(result: CredentialsSubmit) => void>();
  const onBack = vi.fn();
  const view = render(<CredentialsScreen preset={getPreset(presetId)} onBack={onBack} onSubmit={onSubmit} {...props} />);
  return { ...view, onSubmit, onBack };
}

const field = (name: string) => screen.getByLabelText(name, { exact: true });
const form = () => screen.getByRole("form", { name: "Connection details" });

afterEach(() => {
  vault.lock();
});

describe("AC-9.8 a lock drops the keys typed in the form", () => {
  it("clears the secret fields and the pasted text, and keeps provider, endpoint, bucket and start folder", async () => {
    setup("custom");
    await userEvent.type(field("Endpoint URL"), "https://s3.example-provider.test");
    await userEvent.type(field("Access Key ID"), "example-key-id");
    await userEvent.type(field("Secret Access Key"), "example-secret-value");
    await userEvent.type(field("Bucket"), "photos");
    await userEvent.click(screen.getByText("Advanced options"));
    await userEvent.type(field("Session token"), "example-session-token");
    await userEvent.type(field("Start in folder"), "team/");
    act(() => { vault.lock(); });
    expect(field("Access Key ID")).toHaveValue("");
    expect(field("Secret Access Key")).toHaveValue("");
    expect(field("Session token")).toHaveValue("");
    expect(field("Endpoint URL")).toHaveValue("https://s3.example-provider.test");
    expect(field("Bucket")).toHaveValue("photos");
    expect(field("Start in folder")).toHaveValue("team/");
  });

  it("clears the keys of a provider with a publishable key too", async () => {
    setup("supabase");
    await userEvent.click(screen.getByText("Session token", { selector: "label" }));
    await userEvent.type(screen.getByLabelText("Publishable key"), "example-publishable-key");
    act(() => { vault.lock(); });
    expect(screen.getByLabelText("Publishable key")).toHaveValue("");
  });
});

describe("CredentialsScreen: the form (O30 to O33)", () => {
  it("AC-3.1 shows the provider's own labels in order, with the generic S3 term as a caption", () => {
    setup("cloudflare-r2");
    const labels = [...form().querySelectorAll("label")].map((label) => label.textContent);
    expect(labels.slice(0, 4)).toEqual(["Account ID", "Jurisdiction", "Access Key ID", "Secret Access Key"]);
    expect(screen.getByRole("heading", { level: 1, name: "Connect Cloudflare R2" })).toBeInTheDocument();
    // Backblaze says "Application Key ID" and keeps "Access Key ID" as the caption.
  });

  it("AC-3.1 shows the generic term as a caption when it differs from the provider's", () => {
    setup("backblaze-b2");
    expect(field("Application Key ID")).toBeInTheDocument();
    expect(screen.getByText("Access Key ID")).toBeInTheDocument();
  });

  it("AC-3.2 builds the endpoint from the details and lets the person edit it", async () => {
    setup("cloudflare-r2");
    await userEvent.type(field("Account ID"), ACCOUNT);
    expect(screen.getByLabelText("Endpoint", { selector: "output" })).toHaveTextContent(`https://${ACCOUNT}.r2.cloudflarestorage.com`);
    await userEvent.selectOptions(field("Jurisdiction"), "EU");
    expect(screen.getByLabelText("Endpoint", { selector: "output" })).toHaveTextContent(`https://${ACCOUNT}.eu.r2.cloudflarestorage.com`);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Endpoint" })).toHaveValue(`https://${ACCOUNT}.eu.r2.cloudflarestorage.com`);
  });

  it("AC-3.3 shows and hides Supabase fields as the authentication mode changes", async () => {
    setup("supabase");
    expect(screen.queryByLabelText("Publishable key")).toBeNull();
    expect(screen.getByLabelText("Access Key ID")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Session token", { selector: "label" }));
    expect(screen.getByLabelText("Publishable key")).toBeInTheDocument();
    expect(screen.queryByLabelText("Access Key ID")).toBeNull();
    expect(screen.queryByLabelText("Secret Access Key")).toBeNull();
  });

  it("AC-3.4 says what is wrong under the field and links it with aria-describedby", async () => {
    const { onSubmit } = setup("cloudflare-r2");
    await userEvent.type(field("Account ID"), "not-an-id");
    await userEvent.type(field("Access Key ID"), "id");
    await userEvent.type(field("Secret Access Key"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    const input = field("Account ID");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const message = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    expect(message).toHaveTextContent("Account ID is 32 lowercase hex characters.");
    expect(input).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("says which required field is empty", async () => {
    setup("cloudflare-r2");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByText("Access Key ID is required.")).toBeInTheDocument();
    expect(screen.getByText("Secret Access Key is required.")).toBeInTheDocument();
  });

  it("AC-3.5 warns that the endpoint doesn't look like the provider's, before any request is sent", async () => {
    setup("cloudflare-r2");
    await userEvent.type(field("Account ID"), ACCOUNT);
    expect(screen.queryByText(/doesn’t look like a Cloudflare R2 address/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const endpoint = screen.getByRole("textbox", { name: "Endpoint" });
    await userEvent.clear(endpoint);
    await userEvent.type(endpoint, "https://example.com");
    expect(screen.getByText(/doesn’t look like a Cloudflare R2 address/)).toBeInTheDocument();
  });

  it("AC-3.6 masks the secret and never asks for a connection name", () => {
    setup("cloudflare-r2");
    expect(field("Secret Access Key")).toHaveAttribute("type", "password");
    expect(screen.queryByLabelText(/connection name/i)).toBeNull();
  });

  it("AC-3.7 keeps Advanced collapsed, then shows addressing and the optional fields", async () => {
    setup("cloudflare-r2");
    const details = screen.getByText("Advanced options").closest("details");
    expect(details).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("Advanced options"));
    expect(details).toHaveAttribute("open");
    expect(screen.getByRole("group", { name: "Addressing style" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Auto" })).toBeChecked();
  });

  it("AC-3.7 shows a locked addressing style as fixed", async () => {
    setup("alibaba-oss");
    await userEvent.click(screen.getByText("Advanced options"));
    expect(screen.getByRole("group", { name: "Addressing style" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Virtual-hosted" })).toBeChecked();
  });

  it("AC-3.8 blocks an http endpoint that is not localhost with the ob.fail.net wording", async () => {
    const { onSubmit } = setup("custom");
    await userEvent.type(field("Endpoint URL"), "http://192.168.1.20:9000");
    await userEvent.type(field("Access Key ID"), "id");
    await userEvent.type(field("Secret Access Key"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Can’t reach http://192.168.1.20:9000");
    expect(screen.getByRole("alert")).toHaveTextContent("Browsers block http endpoints on https pages, except localhost.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("AC-3.9 takes Start in folder and normalizes it", async () => {
    const { onSubmit } = setup("custom");
    await userEvent.type(field("Endpoint URL"), "http://127.0.0.1:9000");
    await userEvent.type(field("Access Key ID"), "id");
    await userEvent.type(field("Secret Access Key"), "secret");
    await userEvent.click(screen.getByText("Advanced options"));
    await userEvent.type(field("Start in folder"), "/photos/2026");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onSubmit.mock.calls[0]?.[0].plan.prefix).toBe("photos/2026/");
  });

  it("AC-3.9 rejects a folder with '..' and opens Advanced on the problem", async () => {
    const { onSubmit } = setup("custom");
    await userEvent.type(field("Endpoint URL"), "http://127.0.0.1:9000");
    await userEvent.type(field("Access Key ID"), "id");
    await userEvent.type(field("Secret Access Key"), "secret");
    await userEvent.click(screen.getByText("Advanced options"));
    await userEvent.type(field("Start in folder"), "a/../b");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByText(/Use a folder path such as photos\/2026/)).toBeInTheDocument();
    expect(field("Start in folder")).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("AC-3.10 offers Session token and Token expires at when the preset takes a token but has no field", async () => {
    setup("cloudflare-r2");
    await userEvent.click(screen.getByText("Advanced options"));
    expect(field("Session token")).toHaveAttribute("type", "password");
    expect(field("Token expires at")).toBeInTheDocument();
  });

  it("does not offer a token field to a preset that takes none", async () => {
    setup("backblaze-b2");
    await userEvent.click(screen.getByText("Advanced options"));
    expect(screen.queryByLabelText("Session token")).toBeNull();
    expect(screen.queryByLabelText("Token expires at")).toBeNull();
  });

  it("puts the keys in the vault and hands on only values that are not keys", async () => {
    const { onSubmit } = setup("cloudflare-r2");
    await userEvent.type(field("Account ID"), ACCOUNT);
    await userEvent.type(field("Access Key ID"), "example-key-id");
    await userEvent.type(field("Secret Access Key"), "example-secret-value");
    await userEvent.type(field("Bucket"), "my-bucket");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const result = onSubmit.mock.calls[0]?.[0];
    if (!result) throw new Error("not submitted");
    expect(result.bucket).toBe("my-bucket");
    expect(result.plan.endpoint).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(JSON.stringify(result)).not.toContain("example-secret-value");
    expect(JSON.stringify(result)).not.toContain("example-key-id");
    expect(result.values.accountId).toBe(ACCOUNT);
    await expect(vault.credentialsFor(result.connectionId)).resolves.toEqual({
      accessKeyId: "example-key-id",
      secretAccessKey: "example-secret-value",
    });
  });

  it("restores non-secret values and leaves the secret fields empty when shown again", () => {
    setup("cloudflare-r2", { initialValues: { accountId: ACCOUNT, jurisdiction: "eu" } });
    expect(field("Account ID")).toHaveValue(ACCOUNT);
    expect(field("Access Key ID")).toHaveValue("");
    expect(field("Secret Access Key")).toHaveValue("");
  });

  it("AC-2.4 warns that a provider may not allow browser access and goes on", () => {
    setup("oracle-oci");
    expect(screen.getByText(/Oracle OCI may not allow browser access/)).toBeInTheDocument();
    expect(form()).toBeInTheDocument();
  });

  it("has no accessibility violations, with and without errors", async () => {
    const { container } = setup("cloudflare-r2");
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("CredentialsScreen: paste (O34, FR-4)", () => {
  async function paste(text: string) {
    await userEvent.click(screen.getByText("Paste credentials"));
    const area = screen.getByLabelText("Paste here");
    await userEvent.click(area);
    await userEvent.paste(text);
    await userEvent.click(screen.getByRole("button", { name: "Fill the form" }));
  }

  it("AC-4.1 fills fields from AWS-style lines and marks each as detected", async () => {
    setup("cloudflare-r2");
    await paste("AWS_ACCESS_KEY_ID=example-key-id\nAWS_SECRET_ACCESS_KEY=example-secret-value\n");
    expect(field("Access Key ID")).toHaveValue("example-key-id");
    expect(field("Secret Access Key")).toHaveValue("example-secret-value");
    expect(screen.getAllByText("detected")).toHaveLength(2);
  });

  it("AC-4.4 clears the paste area as soon as the form is filled", async () => {
    setup("cloudflare-r2");
    await paste("AWS_ACCESS_KEY_ID=example-key-id\nAWS_SECRET_ACCESS_KEY=example-secret-value");
    expect(screen.getByLabelText("Paste here")).toHaveValue("");
    expect(screen.getByText("The pasted text is cleared as soon as the form is filled. It isn’t stored or sent anywhere.")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("example-secret-value</textarea>");
  });

  it("AC-4.2 parses an rclone block and notes a provider mismatch", async () => {
    setup("cloudflare-r2");
    await paste(
      [
        "[remote]",
        "type = s3",
        "provider = AWS",
        "access_key_id = example-key-id",
        "secret_access_key = example-secret-value",
      ].join("\n"),
    );
    expect(field("Access Key ID")).toHaveValue("example-key-id");
    expect(screen.getByText(/names a different provider than Cloudflare R2/)).toBeInTheDocument();
  });

  it("AC-4.3 fills the account and jurisdiction from a bare endpoint", async () => {
    setup("cloudflare-r2");
    await paste(`https://${ACCOUNT}.eu.r2.cloudflarestorage.com`);
    expect(field("Account ID")).toHaveValue(ACCOUNT);
    expect(field("Jurisdiction")).toHaveValue("eu");
  });

  it("AC-4.5 changes nothing for text it cannot read and says which formats work", async () => {
    setup("cloudflare-r2");
    await userEvent.type(field("Access Key ID"), "typed");
    await paste("hello there");
    expect(field("Access Key ID")).toHaveValue("typed");
    expect(screen.getByText(/Nothing recognized/)).toBeInTheDocument();
  });

  it("AC-4.6 fills the session token and its expiry, and ignores a past expiry with a note", async () => {
    setup("cloudflare-r2");
    await paste("AWS_SESSION_TOKEN=example-token\nAWS_CREDENTIAL_EXPIRATION=2999-01-01T00:00:00Z");
    await userEvent.click(screen.getByText("Advanced options"));
    expect(field("Session token")).toHaveValue("example-token");
    expect((field("Token expires at") as HTMLInputElement).value).toMatch(/^2999-01-01T00:00:00/);
    await paste("AWS_SESSION_TOKEN=other-token\nAWS_CREDENTIAL_EXPIRATION=2001-01-01T00:00:00Z");
    expect(screen.getByText(/Ignored the credential expiration/)).toBeInTheDocument();
  });

  it("keeps the paste button off until there is text", async () => {
    setup("cloudflare-r2");
    await userEvent.click(screen.getByText("Paste credentials"));
    expect(screen.getByRole("button", { name: "Fill the form" })).toBeDisabled();
    expect(within(form()).queryByLabelText("Paste here")).toBeNull();
  });
});
