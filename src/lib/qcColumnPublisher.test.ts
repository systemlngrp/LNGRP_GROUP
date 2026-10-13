import { test } from "node:test";
import assert from "node:assert/strict";
import { createQcColumnPublisher } from "./qcColumnPublisher";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("rapid changes serialize saves and publish the latest selection", async () => {
  const pending: Array<{ columns: number[]; resolve: () => void }> = [];
  let visible: number[] = [];
  let status = "";
  const publisher = createQcColumnPublisher([0, 1, 2], (columns) => new Promise<void>((resolve) => pending.push({ columns, resolve })), (columns) => { visible = columns; }, (message) => { status = message; });
  publisher.publish([0, 1]);
  publisher.publish([1]);
  assert.deepEqual(pending.map((request) => request.columns), [[0, 1]]);
  pending[0].resolve();
  await tick();
  assert.deepEqual(pending.map((request) => request.columns), [[0, 1], [1]]);
  pending[1].resolve();
  await tick();
  assert.deepEqual(visible, [1]);
  assert.equal(status, "Saved");
});

test("a failed save restores the last confirmed layout", async () => {
  let visible: number[] = [];
  let status = "";
  const publisher = createQcColumnPublisher([0, 1], async () => { throw new Error("Save failed"); }, (columns) => { visible = columns; }, (message) => { status = message; });
  publisher.publish([1]);
  await tick();
  assert.deepEqual(visible, [0, 1]);
  assert.equal(status, "Save failed");
});

test("a later failure keeps an earlier confirmed change", async () => {
  let visible: number[] = [];
  const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const publisher = createQcColumnPublisher([0, 1, 2], () => new Promise<void>((resolve, reject) => pending.push({ resolve, reject })), (columns) => { visible = columns; }, () => {});
  publisher.publish([0, 1]);
  publisher.publish([1]);
  pending[0].resolve();
  await tick();
  pending[1].reject(new Error("Save failed"));
  await tick();
  assert.deepEqual(visible, [0, 1]);
});
