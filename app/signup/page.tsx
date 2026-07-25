import type { Metadata } from "next";

import { SignupForm } from "@/components/signup-form";

export const metadata: Metadata = {
  title: "Sign up | Polyglot",
  description: "Create your Polyglot account",
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-md">
        <SignupForm />
      </div>
    </div>
  );
}
