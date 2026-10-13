export function createQcColumnPublisher(
  initial: number[],
  save: (columns: number[]) => Promise<void>,
  onColumns: (columns: number[]) => void,
  onStatus: (message: string) => void,
) {
  let confirmed = [...initial];
  let desired = [...initial];
  let saving = false;
  const same = (left: number[], right: number[]) => left.length === right.length && left.every((value, index) => value === right[index]);

  async function flush() {
    saving = true;
    onStatus("Saving...");
    while (!same(confirmed, desired)) {
      const target = [...desired];
      try {
        await save(target);
        confirmed = target;
      } catch (error) {
        desired = [...confirmed];
        onColumns(desired);
        onStatus(error instanceof Error ? error.message : "Unable to save columns.");
        saving = false;
        return;
      }
    }
    saving = false;
    onStatus("Saved");
  }

  return {
    publish(columns: number[]) {
      desired = [...columns];
      onColumns(desired);
      if (!saving) void flush();
    },
    syncSaved(columns: number[]) {
      if (saving) return;
      confirmed = [...columns];
      desired = [...columns];
      onColumns(desired);
    },
  };
}
