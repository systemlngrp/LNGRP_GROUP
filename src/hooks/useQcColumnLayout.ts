import { useEffect, useRef, useState } from "react";
import { parseQcColumnSelection, type QcReportKey } from "../lib/qcColumnLayout";
import { createQcColumnPublisher } from "../lib/qcColumnPublisher";
import { saveQcColumnLayout } from "../lib/saveQcColumnLayout";

export function useQcColumnLayout(report: QcReportKey, count: number, savedValue: string | undefined, canManage: boolean) {
  const [visible, setVisible] = useState(() => parseQcColumnSelection(savedValue, count));
  const [status, setStatus] = useState("");
  const publisher = useRef<ReturnType<typeof createQcColumnPublisher> | null>(null);
  if (!publisher.current) {
    publisher.current = createQcColumnPublisher(visible, (columns) => saveQcColumnLayout(report, columns), setVisible, setStatus);
  }
  useEffect(() => {
    publisher.current?.syncSaved(parseQcColumnSelection(savedValue, count));
  }, [savedValue, count]);
  const publish = (columns: number[]) => {
    if (!canManage || columns.length === 0) return;
    publisher.current?.publish(columns);
  };
  return { visible, status, publish };
}
