import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { auth } from "@/src/lib/auth"
import { toPublicSource } from "@/src/rag/documents/serialize"
import { listUserDocuments } from "@/src/rag/documents/service"

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/signin")
  }

  const documents = await listUserDocuments(session.user.id)

  return <DashboardShell initialSources={documents.map(toPublicSource)} />
}
