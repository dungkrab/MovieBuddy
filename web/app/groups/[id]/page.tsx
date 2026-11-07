import ChatRoom from "@/components/ChatRoom";

export default async function GroupChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatRoom groupId={Number(id) || 0} />;
}
