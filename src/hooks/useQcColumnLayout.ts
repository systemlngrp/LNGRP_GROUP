import { useEffect, useRef, useState } from "react";
import { parseQcColumnSelection, type QcReportKey } from "../lib/qcColumnLayout";
import { createQcColumnPublisher } from "../lib/qcColumnPublisher";
import { saveQcColumnLayout } from "../lib/saveQcColumnLayout";

export function useQcColumnLayout(report: QcReportKey, count: number, savedValue: string | undefined, canManage: boolean, schemaVersion?: number) {
  const [visible, setVisible] = useState(() => parseQcColumnSelection(savedValue, count, schemaVersion));
  const [status, setStatus] = useState("");
  const publisher = useRef<ReturnType<typeof createQcColumnPublisher> | null>(null);
  if (!publisher.current) {
    publisher.current = createQcColumnPublisher(visible, (columns) => saveQcColumnLayout(report, columns, schemaVersion), setVisible, setStatus);
  }
  useEffect(() => {
    publisher.current?.syncSaved(parseQcColumnSelection(savedValue, count, schemaVersion));
  }, [savedValue, count, schemaVersion]);
  const publish = (columns: number[]) => {
    if (!canManage || columns.length === 0) return;
    publisher.current?.publish(columns);
  };
  const reset = () => {
    if (!canManage) return;
    publisher.current?.reset();
  };
  return { visible, status, publish, reset };
}
