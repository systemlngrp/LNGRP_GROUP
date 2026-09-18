import type { ReactNode } from "react";

type PageHeaderProps = {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
};

/** A title-first header for new and refactored app views. */
export function PageHeader({ title, children, className = "" }: PageHeaderProps) {
  return (
    <div className={`flex flex-col items-stretch gap-3 border-b border-black pb-4 ${className}`.trim()}>
      <h2 className="w-full whitespace-nowrap text-xl font-bold uppercase tracking-tight text-black">{title}</h2>
      {children ? <div className="w-full">{children}</div> : null}
    </div>
  );
}
