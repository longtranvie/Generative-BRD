"use client";

import React from "react";

export default function CodeView({
  code,
  maxHeight = "60vh",
}: {
  code: string;
  maxHeight?: string;
}) {
  // Strip trailing whitespace once, then split. Avoid showing an extra blank
  // line at the bottom if the file ended with a newline.
  const lines = code.replace(/\s+$/, "").split("\n");
  return (
    <div
      className="bg-slate-950 text-slate-100 text-[12px] leading-[1.55] font-mono overflow-auto"
      style={{ maxHeight }}
    >
      <table className="border-collapse w-full">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="align-top">
              <td
                className="select-none text-right pr-3 pl-3 text-slate-500 w-[3.2rem] sticky left-0 bg-slate-950 border-r border-slate-800"
                style={{ userSelect: "none" }}
              >
                {i + 1}
              </td>
              <td className="pr-4 pl-3 whitespace-pre">
                {line || " "}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
