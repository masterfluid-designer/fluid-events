import React from "react";

const Lines = () => {
  return (
    <div className="fixed left-0 top-0 -z-20 flex h-full w-full items-center justify-around">
      <span className="relative h-full w-[1px] overflow-hidden bg-stroke dark:bg-strokedark">
        <span className="absolute left-0 top-0 h-32 w-full animate-line1 bg-linear-to-b from-transparent via-primary to-transparent" />
      </span>
      <span className="relative h-full w-[1px] overflow-hidden bg-stroke dark:bg-strokedark">
        <span className="absolute left-0 top-0 h-32 w-full animate-line2 bg-linear-to-b from-transparent via-primary to-transparent" />
      </span>
      <span className="relative h-full w-[1px] overflow-hidden bg-stroke dark:bg-strokedark">
        <span className="absolute left-0 top-0 h-32 w-full animate-line3 bg-linear-to-b from-transparent via-primary to-transparent" />
      </span>
    </div>
  );
};

export default Lines;
