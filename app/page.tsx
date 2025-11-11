import Image from "next/image";
import PromptUI from "./components/PromptUI";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white font-sans">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white sm:items-start">
       
      </main>
      {/* Prompt UI sits fixed at the bottom of the viewport */}
      <PromptUI />
    </div>
  );
}
