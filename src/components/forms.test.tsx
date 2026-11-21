import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "./Banner";
import { EndpointPreview } from "./EndpointPreview";
import { ComboInput, Field, Segmented, SelectInput, TextInput } from "./Field";
import { HelpInline } from "./HelpInline";
import { ProviderRow } from "./ProviderRow";
import { StepList } from "./StepList";
import { Tab, TabList, TabPanel, Tabs } from "./Tabs";

describe("Field", () => {
  it("ties the label, hint and error to the input", () => {
    render(
      <Field label="Account ID" hint="Copy it from the overview page." error="Account ID is 32 lowercase hex characters.">
        <TextInput />
      </Field>,
    );
    const input = screen.getByLabelText("Account ID");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const described = (input.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["Copy it from the overview page.", "Account ID is 32 lowercase hex characters."]);
  });

  it("shows the caption, optional word and detected marker beside the label, not instead of it", () => {
    render(
      <Field label="Application Key ID" caption="Access Key ID" optionalLabel="optional" marker="detected">
        <TextInput />
      </Field>,
    );
    expect(screen.getByLabelText("Application Key ID")).toBeInTheDocument();
    expect(screen.getByText("Access Key ID")).toBeInTheDocument();
    expect(screen.getByText("optional")).toBeInTheDocument();
    expect(screen.getByText("detected")).toBeInTheDocument();
  });

  it("is not invalid without an error", () => {
    render(
      <Field label="Bucket">
        <TextInput />
      </Field>,
    );
    expect(screen.getByLabelText("Bucket")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Bucket")).not.toHaveAttribute("aria-describedby");
  });

  it("refuses a control outside a Field", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<TextInput />)).toThrow("inside a Field");
    quiet.mockRestore();
  });

  it("offers suggestions on a combo input but accepts other values", async () => {
    render(
      <Field label="Region">
        <ComboInput options={["us-east-1", "eu-west-1"]} />
      </Field>,
    );
    const input = screen.getByLabelText("Region");
    const list = document.getElementById(input.getAttribute("list") ?? "");
    expect([...(list?.querySelectorAll("option") ?? [])].map((option) => option.getAttribute("value"))).toEqual(["us-east-1", "eu-west-1"]);
    await userEvent.type(input, "my-own-region");
    expect(input).toHaveValue("my-own-region");
  });

  it("uses a native select", async () => {
    const onChange = vi.fn();
    render(
      <Field label="Jurisdiction">
        <SelectInput defaultValue="default" onChange={(event) => { onChange(event.target.value); }}>
          <option value="default">Default</option>
          <option value="eu">EU</option>
        </SelectInput>
      </Field>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Jurisdiction"), "eu");
    expect(onChange).toHaveBeenCalledWith("eu");
  });
});

describe("Segmented", () => {
  function Harness() {
    const [value, setValue] = useState("keys");
    return (
      <Segmented
        name="mode"
        legend="Authentication"
        value={value}
        options={[
          { value: "keys", label: "S3 keys" },
          { value: "session", label: "Session token" },
        ]}
        onChange={setValue}
      />
    );
  }

  it("is a labelled radio group that follows keyboard and clicks", async () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Authentication" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "S3 keys" })).toBeChecked();
    await userEvent.click(screen.getByText("Session token"));
    expect(screen.getByRole("radio", { name: "Session token" })).toBeChecked();
    screen.getByRole("radio", { name: "Session token" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "S3 keys" })).toBeChecked();
  });
});

describe("Banner", () => {
  it("is a status, and an alert for errors", () => {
    const { rerender } = render(<Banner tone="info">Demo</Banner>);
    expect(screen.getByRole("status")).toHaveTextContent("Demo");
    rerender(<Banner tone="danger">Broken</Banner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Broken");
    rerender(<Banner tone="warning" title="Heads up">Careful</Banner>);
    expect(screen.getByRole("status")).toHaveTextContent("Heads upCareful");
  });

  it("renders its actions", () => {
    render(<Banner tone="info" actions={<button type="button">Use another key</button>}>Read-only</Banner>);
    expect(screen.getByRole("button", { name: "Use another key" })).toBeInTheDocument();
  });
});

describe("Tabs", () => {
  it("switches panels by click and by arrow key", async () => {
    render(
      <Tabs defaultValue="json">
        <TabList label="Rule format">
          <Tab value="json">JSON</Tab>
          <Tab value="xml">XML</Tab>
        </TabList>
        <TabPanel value="json">json body</TabPanel>
        <TabPanel value="xml">xml body</TabPanel>
      </Tabs>,
    );
    expect(screen.getByRole("tablist", { name: "Rule format" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "JSON" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("json body")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "XML" }));
    expect(screen.getByText("xml body")).toBeVisible();
    screen.getByRole("tab", { name: "XML" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "JSON" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("StepList", () => {
  it("says every status in words and is a polite live region", () => {
    render(
      <StepList
        label="Connection checks"
        rows={[
          { id: "reach", label: "Reach endpoint", status: "pass", statusLabel: "Passed", note: "48 ms" },
          { id: "cors", label: "Check CORS", status: "fail", statusLabel: "Failed", note: "Blocked" },
          { id: "list", label: "List objects", status: "skipped", statusLabel: "Skipped" },
          { id: "write", label: "Write a test file", status: "running", statusLabel: "Running" },
          { id: "read", label: "Read it back", status: "pending", statusLabel: "Waiting" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Connection checks" });
    expect(list).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Passed · 48 ms")).toBeInTheDocument();
    expect(screen.getByText("Failed · Blocked")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
  });
});

describe("ProviderRow", () => {
  it("is a button named by the provider and its badge", async () => {
    const onSelect = vi.fn();
    render(<ProviderRow glyph="OC" name="Oracle OCI" badge="Browser access not supported (CORS)" onSelect={onSelect} />);
    const row = screen.getByRole("button", { name: /Oracle OCI.*Browser access not supported \(CORS\)/ });
    expect(screen.getByText("OC")).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("is taller for popular providers", () => {
    const { rerender } = render(<ProviderRow glyph="R2" name="Cloudflare R2" large onSelect={() => undefined} />);
    expect(screen.getByRole("button")).toHaveClass("min-h-16");
    rerender(<ProviderRow glyph="WA" name="Wasabi" onSelect={() => undefined} />);
    expect(screen.getByRole("button")).toHaveClass("min-h-14");
  });
});

describe("HelpInline", () => {
  it("is collapsed until opened", () => {
    render(<HelpInline summary="Where do I find these?"><p>Open the dashboard.</p></HelpInline>);
    const details = screen.getByText("Where do I find these?").closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Where do I find these?"));
  });
});

describe("EndpointPreview", () => {
  function Harness({ warning }: { warning?: string }) {
    const [value, setValue] = useState("https://abc.r2.cloudflarestorage.com");
    return <EndpointPreview label="Endpoint" note="Built from your details." editLabel="Edit" value={value} onChange={setValue} warning={warning} />;
  }

  it("shows the endpoint in a labelled output and becomes a field on Edit", async () => {
    render(<Harness />);
    expect(screen.getByLabelText("Endpoint", { selector: "output" })).toHaveTextContent("https://abc.r2.cloudflarestorage.com");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Endpoint" });
    await userEvent.clear(field);
    await userEvent.type(field, "https://other.example.com");
    expect(field).toHaveValue("https://other.example.com");
  });

  it("shows a host warning in the preview", () => {
    render(<Harness warning="This endpoint doesn’t look like a Cloudflare R2 address." />);
    expect(screen.getByText(/doesn’t look like/)).toBeInTheDocument();
  });
});

describe("composition", () => {
  it("has no accessibility violations", async () => {
    const { container } = render(
      <main>
        <Field label="Region" hint="Pick one.">
          <ComboInput options={["us-east-1"]} />
        </Field>
        <Field label="Jurisdiction" error="Choose one.">
          <SelectInput>
            <option>Default</option>
          </SelectInput>
        </Field>
        <Banner tone="warning" title="Careful">Read this.</Banner>
        <ProviderRow glyph="R2" name="Cloudflare R2" onSelect={() => undefined} />
        <StepList label="Checks" rows={[{ id: "a", label: "Reach endpoint", status: "pass", statusLabel: "Passed" }]} />
        <HelpInline summary="Help"><p>Text</p></HelpInline>
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
