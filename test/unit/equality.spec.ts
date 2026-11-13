import {Firestore, GeoPoint, Timestamp} from "firebase-admin/firestore";
import {describe, expect, it} from "vitest";
import {firestoreValuesEqual} from "../../src/equality.js";

const firestore = new Firestore({projectId: "equality-test"});

describe("firestoreValuesEqual", () => {
  it.each([
    ["strings", "a", "a"],
    ["numbers", 1.5, 1.5],
    ["NaN", Number.NaN, Number.NaN],
    ["null", null, null],
    ["timestamps", Timestamp.fromMillis(1000), Timestamp.fromMillis(1000)],
    ["geopoints", new GeoPoint(1, 2), new GeoPoint(1, 2)],
    ["document references", firestore.doc("books/b1"), firestore.doc("books/b1")],
    ["bytes", Buffer.from([1, 2, 3]), Buffer.from([1, 2, 3])],
    ["maps in a different key order", {a: 1, b: {c: [1, 2]}}, {b: {c: [1, 2]}, a: 1}],
    ["arrays of maps", [{at: Timestamp.fromMillis(5)}], [{at: Timestamp.fromMillis(5)}]],
  ])("treats equal %s as equal", (_label, a, b) => {
    expect(firestoreValuesEqual(a, b)).toBe(true);
  });

  it.each([
    ["strings", "a", "b"],
    ["a number and its string", 1, "1"],
    ["null and a missing value", null, undefined],
    ["timestamps", Timestamp.fromMillis(1000), Timestamp.fromMillis(1001)],
    ["geopoints", new GeoPoint(1, 2), new GeoPoint(1, 3)],
    ["document references", firestore.doc("books/b1"), firestore.doc("books/b2")],
    ["bytes", Buffer.from([1, 2, 3]), Buffer.from([1, 2, 4])],
    ["bytes of different lengths", Buffer.from([1, 2]), Buffer.from([1, 2, 3])],
    ["a timestamp and a map with its fields", Timestamp.fromMillis(1000), {seconds: 1, nanoseconds: 0}],
    ["maps with an extra key", {a: 1}, {a: 1, b: 2}],
    ["maps with a different nested value", {a: {b: 1}}, {a: {b: 2}}],
    ["arrays in a different order", [1, 2], [2, 1]],
    ["an array and a map", [1], {0: 1}],
  ])("treats different %s as different", (_label, a, b) => {
    expect(firestoreValuesEqual(a, b)).toBe(false);
  });
});
