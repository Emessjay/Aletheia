import { monotonicFactory } from "ulid";

const _ulid = monotonicFactory();

export function newId(): string {
  return _ulid();
}
