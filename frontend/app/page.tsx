import { Suspense } from "react";
import TodoApp from "./todo-app";

export default function Home() {
  return (
    <Suspense fallback={<main className="loading-screen"><span>Getting your day in order...</span></main>}>
      <TodoApp />
    </Suspense>
  );
}
