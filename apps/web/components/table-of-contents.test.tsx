import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TableOfContents } from "./table-of-contents.js";

describe("TableOfContents", () => {
  it("renders a link per item, pointing at its section anchor", () => {
    render(
      <TableOfContents
        items={[
          { id: "summary", label: "Summary" },
          { id: "data-model", label: "Data model" },
        ]}
      />,
    );

    const summaryLink = screen.getByRole("link", { name: "Summary" });
    expect(summaryLink).toHaveAttribute("href", "#summary");
    expect(screen.getByRole("link", { name: "Data model" })).toHaveAttribute("href", "#data-model");
  });

  it("highlights the first item as active by default", () => {
    render(
      <TableOfContents
        items={[
          { id: "summary", label: "Summary" },
          { id: "data-model", label: "Data model" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Summary" })).toHaveClass("text-accent-600");
    expect(screen.getByRole("link", { name: "Data model" })).not.toHaveClass("text-accent-600");
  });
});
