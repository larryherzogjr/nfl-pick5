import { useState } from "react";
import { NFL_TEAMS } from "../utils/teams";

export default function TeamLogo({ abbreviation }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const url = NFL_TEAMS[abbreviation]?.logo;
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      {url && failedUrl !== url ? (
        <img
          src={url}
          alt=""
          width="48"
          height="48"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
          {abbreviation}
        </span>
      )}
    </span>
  );
}
