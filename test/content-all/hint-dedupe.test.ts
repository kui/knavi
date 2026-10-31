import { describe, test } from "node:test";
import assert from "node:assert/strict";

class FakeNode {
  readonly parent: FakeNode | null;
  constructor(parent: FakeNode | null = null) {
    this.parent = parent;
  }
  contains(other: FakeNode | null): boolean {
    for (let n = other; n; n = n.parent) if (n === this) return true;
    return false;
  }
  getRootNode(): FakeNode {
    return this.parent ? this.parent.getRootNode() : this;
  }
}
class FakeShadowRoot extends FakeNode {
  readonly host: FakeNode;
  constructor(host: FakeNode) {
    super();
    this.host = host;
  }
}
// WHY: containsComposed checks `instanceof ShadowRoot`, which Node.js lacks.
(globalThis as Record<string, unknown>).ShadowRoot = FakeShadowRoot;

const { dropNestedHeuristicDuplicates } =
  await import("../../src/content-all/hint-dedupe.js");

type Candidate = Parameters<typeof dropNestedHeuristicDuplicates>[0][number];

function rect(x: number, y = 0): RectJSON<"element-border", "root-viewport"> {
  return {
    type: "element-border",
    origin: "root-viewport",
    x,
    y,
    width: 100,
    height: 20,
  };
}

function candidate(
  element: FakeNode,
  heuristic: boolean,
  rects = [rect(0)],
): Candidate {
  return { element: element as unknown as Element, rects, heuristic };
}

function survivors(...candidates: Candidate[]): unknown[] {
  return dropNestedHeuristicDuplicates(candidates).map((c) => c.element);
}

void describe("dropNestedHeuristicDuplicates", () => {
  const wrapper = new FakeNode();
  const button = new FakeNode(wrapper);
  const host = new FakeNode();
  const inner = new FakeNode(new FakeShadowRoot(host));

  void test("drops a heuristic wrapper around a real control", () =>
    assert.deepEqual(
      survivors(candidate(wrapper, true), candidate(button, false)),
      [button],
    ));

  void test("drops a heuristic descendant of a real control", () =>
    assert.deepEqual(
      survivors(candidate(button, true), candidate(wrapper, false)),
      [wrapper],
    ));

  void test("drops a heuristic host around a real control in its shadow tree", () =>
    assert.deepEqual(
      survivors(candidate(host, true), candidate(inner, false)),
      [inner],
    ));

  void test("keeps both of two nested heuristic candidates", () =>
    assert.deepEqual(survivors(candidate(host, true), candidate(inner, true)), [
      host,
      inner,
    ]));

  void test("keeps both when the rects differ", () =>
    assert.deepEqual(
      survivors(
        candidate(wrapper, true, [rect(0)]),
        candidate(button, false, [rect(0, 1)]),
      ),
      [wrapper, button],
    ));

  void test("keeps both when neither contains the other", () => {
    const sibling = new FakeNode();
    assert.deepEqual(
      survivors(candidate(sibling, true), candidate(button, false)),
      [sibling, button],
    );
  });

  void test("keeps both real controls", () =>
    assert.deepEqual(
      survivors(candidate(wrapper, false), candidate(button, false)),
      [wrapper, button],
    ));

  void test("compares the actual click targets", () => {
    const link = new FakeNode();
    const linkChild = new FakeNode(link);
    const viaLink: Candidate = {
      ...candidate(new FakeNode(), true),
      actualTarget: link as unknown as Element,
    };
    assert.deepEqual(survivors(viaLink, candidate(linkChild, false)), [
      linkChild,
    ]);
  });
});
