/*
 * Heap primitives for exact candidate-join slot generation.
 *
 * Heap order is a traversal strategy for finding strong candidates early. Correctness comes
 * from the generator's optimistic upper bounds and abort reporting, not from heap ordering.
 */

import type { MedleyExactSlotCandidateSearchNode } from "../types";

export type MedleyExactSlotUpperHeapNode = {
  key: number;
  node: MedleyExactSlotCandidateSearchNode;
};

export function pushMedleyExactSlotNode(
  heap: MedleyExactSlotCandidateSearchNode[],
  node: MedleyExactSlotCandidateSearchNode,
): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (heap[parentIndex].key >= node.key) {
      break;
    }
    heap[index] = heap[parentIndex];
    index = parentIndex;
  }
  heap[index] = node;
}

export function popMedleyExactSlotNode(
  heap: MedleyExactSlotCandidateSearchNode[],
): MedleyExactSlotCandidateSearchNode | null {
  const root = heap[0];
  if (!root) {
    return null;
  }
  const tail = heap.pop();
  if (tail && heap.length > 0) {
    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      if (leftIndex >= heap.length) {
        break;
      }
      const childIndex = rightIndex < heap.length && heap[rightIndex].key > heap[leftIndex].key
        ? rightIndex
        : leftIndex;
      if (heap[childIndex].key <= tail.key) {
        break;
      }
      heap[index] = heap[childIndex];
      index = childIndex;
    }
    heap[index] = tail;
  }
  return root;
}

export function pushMedleyExactSlotUpperNode(
  heap: MedleyExactSlotUpperHeapNode[],
  node: MedleyExactSlotUpperHeapNode,
): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (heap[parentIndex].key >= node.key) {
      break;
    }
    heap[index] = heap[parentIndex];
    index = parentIndex;
  }
  heap[index] = node;
}

export function popMedleyExactSlotUpperNode(
  heap: MedleyExactSlotUpperHeapNode[],
): MedleyExactSlotUpperHeapNode | null {
  const root = heap[0];
  if (!root) {
    return null;
  }
  const tail = heap.pop();
  if (tail && heap.length > 0) {
    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      if (leftIndex >= heap.length) {
        break;
      }
      const childIndex = rightIndex < heap.length && heap[rightIndex].key > heap[leftIndex].key
        ? rightIndex
        : leftIndex;
      if (heap[childIndex].key <= tail.key) {
        break;
      }
      heap[index] = heap[childIndex];
      index = childIndex;
    }
    heap[index] = tail;
  }
  return root;
}

export function pushMedleyExactSlotUpperSearchNode(
  heap: MedleyExactSlotCandidateSearchNode[],
  node: MedleyExactSlotCandidateSearchNode,
): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (heap[parentIndex].slotUpperBound >= node.slotUpperBound) {
      break;
    }
    heap[index] = heap[parentIndex];
    index = parentIndex;
  }
  heap[index] = node;
}

export function popMedleyExactSlotUpperSearchNode(
  heap: MedleyExactSlotCandidateSearchNode[],
): MedleyExactSlotCandidateSearchNode | null {
  const root = heap[0];
  if (!root) {
    return null;
  }
  const tail = heap.pop();
  if (tail && heap.length > 0) {
    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      if (leftIndex >= heap.length) {
        break;
      }
      const childIndex = rightIndex < heap.length && heap[rightIndex].slotUpperBound > heap[leftIndex].slotUpperBound
        ? rightIndex
        : leftIndex;
      if (heap[childIndex].slotUpperBound <= tail.slotUpperBound) {
        break;
      }
      heap[index] = heap[childIndex];
      index = childIndex;
    }
    heap[index] = tail;
  }
  return root;
}
