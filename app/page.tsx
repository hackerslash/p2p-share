
import { Suspense } from "react";
import FileShare from "@/components/FileShare";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function Home() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <FileShare />
    </Suspense>
  );
}
