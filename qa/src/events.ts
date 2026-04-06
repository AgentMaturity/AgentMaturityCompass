type Listener = (type: string, data: any) => void;
const listeners: Listener[] = [];

export function emit(type: string, data: any) {
  for (const fn of listeners) fn(type, data);
}

export function onBroadcast(fn: Listener) {
  listeners.push(fn);
}
