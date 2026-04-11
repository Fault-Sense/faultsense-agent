// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

/**
 * Reproduce the HTMX example's toggle-complete bug:
 * hx-swap="outerHTML" replaces the .todo-item with a new one that has
 * classlist=completed:<expected>. The assertion uses fs-assert-added with
 * classlist + data-status modifiers.
 *
 * User report: unchecking passes, checking fails.
 */
describe("Faultsense Agent - outerHTML swap toggle (HTMX pattern)", () => {
  let ctx: ReturnType<typeof setupAgent>;
  // Local aliases keep the test bodies unchanged.
  let sendToServerMock: ReturnType<typeof setupAgent>["sendToCollectorSpy"];
  let config: ReturnType<typeof setupAgent>["config"];

  beforeEach(() => {
    // Real timers: this suite relies on natural microtask interleaving through
    // the MutationObserver → settle → OOB chain. Use deferInit so each test
    // can call ctx.init() after seeding the DOM.
    ctx = setupAgent({
      fakeTimers: false,
      deferInit: true,
      config: { gcInterval: 30000 },
    });
    sendToServerMock = ctx.sendToCollectorSpy;
    config = ctx.config;
  });

  afterEach(() => {
    ctx.cleanup();
  });

  /** Render a full todo-item partial matching the HTMX example exactly. */
  function todoItemHtml(id: number, completed: boolean): string {
    const expectedNext = !completed
    return `
      <div id="todo-${id}"
           class="todo-item${completed ? ' completed' : ''}"
           data-status="${completed ? 'completed' : 'active'}">
        <input type="checkbox" class="checkbox"${completed ? ' checked' : ''}
          fs-assert="todos/toggle-complete"
          fs-trigger="change"
          fs-assert-added=".todo-item[classlist=completed:${expectedNext}][data-status=active|completed]"
          fs-assert-visible="#edit-btn-${id}[disabled=${expectedNext}]" />
        <span class="text">Todo ${id}</span>
        <div class="actions">
          <button id="edit-btn-${id}"${completed ? ' disabled' : ''}>Edit</button>
        </div>
      </div>
    `
  }

  function renderList(items: Array<{ id: number; completed: boolean }>) {
    document.body.innerHTML = `
      <div id="app">
        <div id="todo-count" class="count">pending</div>
        <div id="todo-list" class="todo-list">
          ${items.map(i => todoItemHtml(i.id, i.completed)).join('\n')}
        </div>
      </div>
    `
  }

  /**
   * Simulate HTMX outerHTML swap: replace #todo-N with a new element tree.
   * Mirrors what htmx does internally — childList mutation on the parent
   * with removedNodes=[old], addedNodes=[new].
   */
  function swapTodoItem(id: number, html: string) {
    const old = document.getElementById(`todo-${id}`)!
    const temp = document.createElement("div")
    temp.innerHTML = html.trim()
    const fresh = temp.firstElementChild as HTMLElement
    old.parentNode!.replaceChild(fresh, old)
  }

  async function expectAssertion(status: "passed" | "failed", key: string) {
    return vi.waitFor(() => {
      const allPayloads = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0])
      expect(allPayloads).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ assertionKey: key, status }),
        ])
      )
    })
  }

  it("CHECK direction on a single-item list", async () => {
    renderList([{ id: 1, completed: false }])
    ctx.init()
    const cb = document.querySelector("#todo-1 input") as HTMLInputElement
    cb.checked = true
    cb.dispatchEvent(new Event("change", { bubbles: true }))
    swapTodoItem(1, todoItemHtml(1, true))
    await expectAssertion("passed", "todos/toggle-complete")
  })

  it("UNCHECK direction on a single-item list", async () => {
    renderList([{ id: 1, completed: true }])
    ctx.init()
    const cb = document.querySelector("#todo-1 input") as HTMLInputElement
    cb.checked = false
    cb.dispatchEvent(new Event("change", { bubbles: true }))
    swapTodoItem(1, todoItemHtml(1, false))
    await expectAssertion("passed", "todos/toggle-complete")
  })

  it("CHECK direction on a multi-item list where OTHER items also exist as .todo-item", async () => {
    // The user's real scenario — three todos on page, check the first one.
    // Other .todo-items are present in the DOM but not in addedElements.
    renderList([
      { id: 1, completed: false },
      { id: 2, completed: false },
      { id: 3, completed: false },
    ])
    ctx.init()
    const cb = document.querySelector("#todo-1 input") as HTMLInputElement
    cb.checked = true
    cb.dispatchEvent(new Event("change", { bubbles: true }))
    swapTodoItem(1, todoItemHtml(1, true))
    await expectAssertion("passed", "todos/toggle-complete")
  })

  it("CHECK direction after prior UNCHECK cycle (simulates re-check after retryCompletedAssertion)", async () => {
    // Start: todo-1 is completed. User unchecks, then re-checks.
    renderList([{ id: 1, completed: true }])
    ctx.init()

    // 1. Uncheck
    let cb = document.querySelector("#todo-1 input") as HTMLInputElement
    cb.checked = false
    cb.dispatchEvent(new Event("change", { bubbles: true }))
    swapTodoItem(1, todoItemHtml(1, false))
    await expectAssertion("passed", "todos/toggle-complete")

    sendToServerMock.mockClear()

    // 2. Re-check. The new checkbox has classlist=completed:true (expected
    //    next state after checking an uncompleted item).
    cb = document.querySelector("#todo-1 input") as HTMLInputElement
    cb.checked = true
    cb.dispatchEvent(new Event("change", { bubbles: true }))
    swapTodoItem(1, todoItemHtml(1, true))

    await vi.waitFor(() => {
      const allPayloads = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0])
      const toggleEvents = allPayloads.filter((p: any) => p.assertionKey === "todos/toggle-complete")
      // After retryCompletedAssertion, previousStatus === "passed" and the new
      // resolution is also "passed", so getAssertionsToSettle filters it out —
      // no new sendToCollector call is expected. But if it's FAILED, it will
      // show up (passed → failed IS a status change).
      // Assert there are NO failures from the second toggle.
      const failures = toggleEvents.filter((p: any) => p.status === "failed")
      expect(failures).toHaveLength(0)
    })
  })

  it("save-edit: clicking Save fires fs-assert-removed assertion", async () => {
    // Simulate the edit mode: input.todo-edit-input + save button inside the item
    document.body.innerHTML = `
      <div id="todo-list">
        <div id="todo-1" class="todo-item" data-status="editing">
          <input class="todo-edit-input" value="text" />
          <button class="save-btn"
            fs-assert="todos/save-edit"
            fs-trigger="click"
            fs-assert-removed=".todo-edit-input">Save</button>
        </div>
      </div>
    `
    ctx.init()

    const save = document.querySelector(".save-btn") as HTMLButtonElement
    save.click()

    // Simulate the server response swap: item back to read-only (no edit input)
    document.getElementById("todo-1")!.outerHTML = `
      <div id="todo-1" class="todo-item" data-status="active">
        <span class="text">text</span>
      </div>
    `

    await vi.waitFor(() => {
      const allPayloads = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0])
      const saveEvents = allPayloads.filter((p: any) => p.assertionKey === "todos/save-edit")
      expect(saveEvents.some((p: any) => p.status === "passed")).toBe(true)
    })
  })

})
