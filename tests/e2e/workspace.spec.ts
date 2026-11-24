import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Ace } from "ace-builds";

interface AceElement extends HTMLElement {
  env: { editor: Ace.Editor };
}

const hintRows = [0, 35, 100, 179];

function paneState(pane: Locator) {
  return pane.evaluate(element => {
    const editor = (element as AceElement).env.editor;
    return {
      top: editor.session.getScrollTop(),
      left: editor.session.getScrollLeft(),
      row: editor.getCursorPosition().row,
      folds: editor.session
        .getAllFolds()
        .map(fold => [fold.start.row, fold.end.row])
    };
  });
}

function hintAt(pane: Locator, row: number) {
  return pane
    .locator(`[data-slot="ace-gutter-hint"][data-row="${row}"]`)
    .getByRole("button");
}

function foldAt(pane: Locator, row: number) {
  return pane
    .locator(".ace_gutter-cell")
    .filter({ hasText: new RegExp(`^ *${row + 1} *$`) })
    .locator(".ace_fold-widget.ace_start");
}

async function expectAlignedHints(pane: Locator) {
  await expect
    .poll(() =>
      pane.evaluate((element, expectedRows) => {
        const errors: string[] = [];
        const cells = new Map(
          [...element.querySelectorAll(".ace_gutter-cell")].map(cell => [
            Number(cell.firstChild?.textContent?.trim()) - 1,
            cell
          ])
        );
        for (const hint of element.querySelectorAll<HTMLElement>(
          '[data-slot="ace-gutter-hint"]'
        )) {
          const row = Number(hint.dataset.row);
          const cell = cells.get(row);
          if (!expectedRows.includes(row) || !cell) {
            errors.push(`Unexpected Hint at line ${row + 1}`);
            continue;
          }
          const number = element.ownerDocument.createRange();
          number.selectNodeContents(cell.firstChild!);
          const hintBox = hint.getBoundingClientRect();
          const numberBox = number.getBoundingClientRect();
          const foldBox = cell
            .querySelector(".ace_fold-widget")!
            .getBoundingClientRect();
          if (Math.abs(cell.getBoundingClientRect().top - hintBox.top) > 1) {
            errors.push(`Hint shifted vertically at line ${row + 1}`);
          }
          if (
            numberBox.right > hintBox.left + 1 ||
            hintBox.right > foldBox.left + 2
          ) {
            errors.push(`Hint overlaps the number or fold at line ${row + 1}`);
          }
        }
        return errors;
      }, hintRows)
    )
    .toEqual([]);
}

async function openSplit(page: Page, direction: "right" | "down") {
  await page.getByRole("tab", { name: "split-demo.sql", exact: true }).click({
    button: "right"
  });
  await page
    .getByRole("menuitem", {
      name: direction === "right" ? "Split Right" : "Split Down",
      exact: true
    })
    .click();
  const panel = page.getByRole("tabpanel");
  await expect(panel).toHaveAttribute("data-split", direction);
  const panes = panel.locator(".ace_editor");
  await expect(panes).toHaveCount(2);
  return [panes.nth(0), panes.nth(1)] as const;
}

async function scrollToHint(page: Page, pane: Locator, row: number) {
  await pane.locator(".ace_scroller").hover({ position: { x: 70, y: 70 } });
  // Approach the target with real wheel events, without assuming Ace's speed.
  for (let step = 0; step < 12; step++) {
    const position = await pane.evaluate((element, row) => {
      const { renderer, session } = (element as AceElement).env.editor;
      return {
        top: session.getScrollTop(),
        target:
          Math.max(0, session.documentToScreenRow(row, 0) - 3) *
          renderer.lineHeight,
        lineHeight: renderer.lineHeight
      };
    }, row);
    const distance = position.target - position.top;
    if (Math.abs(distance) < position.lineHeight) break;
    await page.mouse.wheel(0, distance);
    await expect
      .poll(async () => (await paneState(pane)).top)
      .not.toBe(position.top);
  }
  await expect(hintAt(pane, row)).toBeVisible();
  await expectAlignedHints(pane);
}

async function dragHorizontal(page: Page, pane: Locator) {
  const track = pane.locator(":scope > .ace_sb-h");
  const thumb = track.locator(":scope > div").first();
  await expect(thumb).toBeVisible();
  const trackBox = (await track.boundingBox())!;
  const thumbBox = (await thumb.boundingBox())!;
  const y = thumbBox.y + thumbBox.height / 2;
  await page.mouse.move(thumbBox.x + thumbBox.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(trackBox.x + trackBox.width / 2, y, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await paneState(pane)).left)
    .toBeGreaterThan(100);
}

async function exerciseHintAndFold(pane: Locator, other: Locator, row: number) {
  const before = await paneState(pane);
  const otherBefore = await paneState(other);
  const hint = hintAt(pane, row);
  const fold = foldAt(pane, row);
  await expect(hint).toHaveAccessibleName(`Jump to SQL on line ${row + 1}`);
  await hint.click();
  await expect.poll(async () => (await paneState(pane)).row).toBe(row);
  expect((await paneState(pane)).folds).toEqual(before.folds);
  expect(await paneState(other)).toEqual(otherBefore);

  await fold.click();
  await expect
    .poll(async () => (await paneState(pane)).folds)
    .toEqual([...before.folds, [row, row + 4]]);
  await expectAlignedHints(pane);
  await hint.click();
  expect((await paneState(pane)).folds).toContainEqual([row, row + 4]);
  expect(await paneState(other)).toEqual(otherBefore);
  await fold.click();
  await expect
    .poll(async () => (await paneState(pane)).folds)
    .toEqual(before.folds);
}

test("applies custom Tailwind classes to editor and custom-document menus", async ({
  page
}) => {
  await page.goto("/workspace.html");
  for (const name of [
    "customers.sql",
    "query-settings.json",
    "Customers preview"
  ]) {
    await page
      .getByRole("tab", { name, exact: true })
      .click({ button: "right" });
    const menu = page.getByRole("menu", { name, exact: true });
    await expect(menu).toHaveCSS("width", "256px");
    await expect(menu).toHaveCSS("border-radius", "12px");
    await expect(menu.getByRole("menuitem").first()).toHaveCSS(
      "min-height",
      "32px"
    );
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await page
    .getByRole("tab", { name: "customers.sql", exact: true })
    .click({ button: "right" });
  const menu = page.getByRole("menu", { name: "customers.sql", exact: true });
  await expect(menu).toHaveCSS("width", "256px");
  await menu.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("keeps the right-click menu open when its opening mouse button is released", async ({
  page
}) => {
  await page.goto("/workspace.html");
  await page.getByRole("tab", { name: "customers.sql", exact: true }).hover();
  await page.mouse.down({ button: "right" });
  const menu = page.getByRole("menu", { name: "customers.sql", exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Rename", exact: true }).hover();
  await page.mouse.up({ button: "right" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("maintains editing and keyboard selection after adding many tabs", async ({
  page
}) => {
  await page.goto("/workspace.html");
  const add = page.getByRole("button", { name: "New document", exact: true });
  for (let index = 0; index < 20; index++) await add.click();
  await expect(page.getByRole("tab")).toHaveCount(23);
  const panel = page.getByRole("tabpanel");
  await panel.getByRole("textbox").focus();
  await page.keyboard.press("End");
  await page.keyboard.insertText("123");
  await expect(page.getByRole("tab", { selected: true })).toHaveAccessibleName(
    "query-20.sql, Unsaved changes"
  );
  await expect(panel.locator(".ace_text-layer")).toContainText("SELECT 123");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.insertText("SELECT ");
  await expect(page.getByRole("tab", { selected: true })).toHaveAccessibleName(
    "query-20.sql"
  );

  const more = page.getByRole("button", { name: "More tabs", exact: true });
  await more.click();
  const menu = page.getByRole("menu", { name: "More tabs", exact: true });
  await expect(menu.getByRole("menuitemradio")).toHaveCount(23);
  await expect(
    menu.locator('[data-slot="ace-workspace-menu-indicator"]')
  ).toHaveCount(1);
  await expect(
    menu.getByRole("menuitemradio", { checked: true })
  ).toHaveAccessibleName("query-20.sql");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { selected: true })).toHaveAccessibleName(
    "customers.sql"
  );
  await page
    .getByRole("button", { name: "Close query-20.sql", exact: true })
    .click();
  await expect(page.getByRole("tab")).toHaveCount(22);
});

for (const direction of ["right", "down"] as const) {
  test(`keeps Hint rows and folds independent in a ${direction} split`, async ({
    page
  }) => {
    await page.goto("/workspace.html?example=sql-split");
    const [primary, secondary] = await openSplit(page, direction);
    await expect
      .poll(() =>
        primary.evaluate(element =>
          (element as AceElement).env.editor.session.getLength()
        )
      )
      .toBe(240);
    const firstBox = (await primary.boundingBox())!;
    const secondBox = (await secondary.boundingBox())!;
    if (direction === "right") {
      expect(secondBox.x).toBeGreaterThanOrEqual(firstBox.x + firstBox.width);
    } else {
      expect(secondBox.y).toBeGreaterThanOrEqual(firstBox.y + firstBox.height);
    }
    await exerciseHintAndFold(primary, secondary, 0);
    const secondaryBefore = await paneState(secondary);
    await scrollToHint(page, primary, 35);
    expect(await paneState(secondary)).toEqual(secondaryBefore);
    const primaryBefore = await paneState(primary);
    await scrollToHint(page, secondary, 100);
    expect(await paneState(primary)).toEqual(primaryBefore);
    await dragHorizontal(page, primary);
    await dragHorizontal(page, secondary);
    await exerciseHintAndFold(primary, secondary, 35);
    await exerciseHintAndFold(secondary, primary, 100);
    await scrollToHint(page, primary, 179);
    await exerciseHintAndFold(primary, secondary, 179);
    await foldAt(primary, 179).click();
    await expect
      .poll(async () => (await paneState(primary)).folds)
      .toEqual([[179, 183]]);
    await openSplit(page, direction === "right" ? "down" : "right");
    expect((await paneState(primary)).folds).toEqual([[179, 183]]);
    expect((await paneState(secondary)).folds).toEqual([]);
    await expectAlignedHints(primary);
    await expectAlignedHints(secondary);
  });
}

for (const demo of [
  { query: "fold-hint", label: "query-settings.json" },
  { query: "sql-fold-hint", label: "fold-hint.sql" }
]) {
  test(`fold and custom Hint remain separately clickable in ${demo.label}`, async ({
    page
  }) => {
    await page.goto(`/workspace.html?example=${demo.query}`);
    await expect(
      page.getByRole("tab", { name: demo.label, exact: true })
    ).toHaveAttribute("aria-selected", "true");
    const panel = page.getByRole("tabpanel");
    const pane = panel.locator(".ace_editor");
    const hint = hintAt(pane, 0);
    const fold = foldAt(pane, 0);
    await hint.click();
    await expect(panel.getByRole("status")).toHaveText("Hint clicks 1");
    await fold.click();
    await expect
      .poll(async () => (await paneState(pane)).folds)
      .toEqual([[0, 4]]);
    await hint.click();
    await expect(panel.getByRole("status")).toHaveText("Hint clicks 2");
    expect((await paneState(pane)).folds).toEqual([[0, 4]]);
    await fold.click();
    await expect.poll(async () => (await paneState(pane)).folds).toEqual([]);
  });
}
