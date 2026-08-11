import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearch, useParams } from "wouter";
import { ArrowLeft, Video, VideoOff, User, Loader2, FileText, Download, CheckCircle2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { agentsApi, anamApi, feedbackApi, interviewLinksApi, type ChatMessage } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function Launch() {
  const { toast } = useToast();
  const search = useSearch();
  const params = useParams();
  const token = params.token as string | undefined;
  const queryAgentId = Number(new URLSearchParams(search).get("agentId")) || undefined;

  // When opened via a public link, resolve the token to its agent.
  const { data: linkData, isLoading: linkLoading, isError: linkError } = useQuery({
    queryKey: ["interview-link", token],
    queryFn: () => interviewLinksApi.resolve(token as string),
    enabled: !!token,
  });

  const { data: queryAgent, isLoading: queryAgentLoading } = useQuery({
    queryKey: ["agent", queryAgentId],
    queryFn: () => agentsApi.getById(queryAgentId as number),
    enabled: !!queryAgentId && !token,
  });

  const agent = token ? linkData?.agent : queryAgent;
  const agentId = agent?.id;
  const agentLoading = token ? linkLoading : queryAgentLoading;

  const [avatarStreaming, setAvatarStreaming] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarFullscreen, setAvatarFullscreen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [interviewEnded, setInterviewEnded] = useState(false);

  const anamClientRef = useRef<any>(null);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const avatarContainerRef = useRef<HTMLDivElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const processedMsgIdsRef = useRef<Set<string>>(new Set());
  const finalizingRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);

  const queryClient = useQueryClient();
  const { data: voiceSettings } = useQuery({
    queryKey: ["anam-voice-settings"],
    queryFn: anamApi.getVoiceSettings,
  });
  const noisyMutation = useMutation({
    mutationFn: (noisyEnvironment: boolean) => anamApi.setVoiceSettings({ noisyEnvironment }),
    onSuccess: (settings) => {
      queryClient.setQueryData(["anam-voice-settings"], settings);
      toast({
        title: settings.noisyEnvironment ? "Noisy environment mode on" : "Noisy environment mode off",
        description: "Applies to the next session you start.",
      });
    },
    onError: (err: any) => toast({ title: "Could not save setting", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const finalizeInterview = useCallback(async () => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    setInterviewEnded(true);

    const transcript = chatMessagesRef.current;
    if (!agentId || transcript.length === 0) {
      finalizingRef.current = false;
      return;
    }
    setSummaryLoading(true);
    try {
      const result = await feedbackApi.generateSummary({ agentId, transcript });
      setSummary(result.summary);
      toast({ title: "Interview complete", description: "The transcript and summary have been saved." });
    } catch (err: any) {
      toast({ title: "Could not generate summary", description: err.message, variant: "destructive" });
      finalizingRef.current = false;
    } finally {
      setSummaryLoading(false);
    }
  }, [agentId, toast]);

  const startInterview = useCallback(async () => {
    if (!agent || avatarLoading || avatarStreaming) return;
    setAvatarLoading(true);
    setAvatarError(null);
    setSummary(null);
    setInterviewEnded(false);
    finalizingRef.current = false;
    processedMsgIdsRef.current = new Set();
    setChatMessages([]);
    chatMessagesRef.current = [];

    // Defensively tear down any existing client/mic before creating new ones
    if (anamClientRef.current) {
      try { await anamClientRef.current.stopStreaming(); } catch {}
      anamClientRef.current = null;
    }
    stopMicStream();

    try {
      const { sessionToken } = await anamApi.getSessionToken({
        name: agent.name,
        systemPrompt: agent.systemPrompt || `You are ${agent.name}, a helpful AI assistant. Reply in natural speech without formatting. Add pauses using '...'`,
      }, agent.id);

      const { createClient, AnamEvent } = await import("@anam-ai/js-sdk");
      const client = createClient(sessionToken);
      anamClientRef.current = client;

      client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages: any[]) => {
        // Process every unseen message in order so nothing is dropped, deduping by id only
        const newEntries: ChatMessage[] = [];
        for (const m of messages) {
          if (!m.id || processedMsgIdsRef.current.has(m.id)) continue;
          const isPersona = m.role === "persona";
          const isHuman = m.role === "human" || m.role === "user";
          if (isPersona && m.interrupted) continue;
          if (!isPersona && !isHuman) continue;
          processedMsgIdsRef.current.add(m.id);
          newEntries.push({ role: isPersona ? "assistant" : "user", content: m.content || "" });
        }
        if (newEntries.length === 0) return;
        setChatMessages(prev => {
          const updated = [...prev, ...newEntries];
          chatMessagesRef.current = updated;
          return updated;
        });
      });

      client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
        avatarClosedCleanup();
        finalizeInterview();
      });

      // Request the mic with noise suppression, echo cancellation, and auto
      // gain control — important for kiosk deployments in noisy environments.
      let micStream: MediaStream | undefined;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
          },
        });
        micStreamRef.current = micStream;
      } catch {
        // Fall back to the SDK's own mic handling if constraints are rejected.
        micStream = undefined;
      }

      if (avatarVideoRef.current) {
        await client.streamToVideoElement(avatarVideoRef.current.id, micStream);
        setAvatarStreaming(true);
      } else {
        throw new Error("Video element not ready. Please try again.");
      }
    } catch (error: any) {
      console.error("Avatar start error:", error);
      stopMicStream();
      setAvatarError(error.message || "Failed to start the interview");
    } finally {
      setAvatarLoading(false);
    }
  }, [agent, finalizeInterview, avatarLoading, avatarStreaming]);

  const stopMicStream = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  };

  const avatarClosedCleanup = () => {
    anamClientRef.current = null;
    stopMicStream();
    setAvatarStreaming(false);
  };

  const endInterview = useCallback(async () => {
    try {
      if (anamClientRef.current) {
        await anamClientRef.current.stopStreaming();
        anamClientRef.current = null;
      }
    } catch (error) {
      console.error("Avatar stop error:", error);
    }
    stopMicStream();
    setAvatarStreaming(false);
    await finalizeInterview();
  }, [finalizeInterview]);

  useEffect(() => {
    return () => {
      if (anamClientRef.current) {
        try { anamClientRef.current.stopStreaming(); } catch {}
        anamClientRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
    };
  }, []);

  const toggleAvatarFullscreen = () => {
    const el = avatarContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setAvatarFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setAvatarFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handler = () => setAvatarFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const handleDownloadSummary = () => {
    if (!summary) return;
    const header = `360 FEEDBACK SUMMARY\nAgent: ${agent?.name || ""}\nGenerated: ${new Date().toLocaleString()}\n\n`;
    const blob = new Blob([header + summary], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `feedback-summary-${(agent?.name || "session").toLowerCase().replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (agentLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if ((token && linkError) || !agent) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground" data-testid="text-invalid-link">
          {token ? "This interview link is invalid or has expired." : "No agent selected."}
        </p>
        <Link href="/"><Button variant="outline" data-testid="link-home">Back to Home</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-400/20 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-semibold text-lg leading-tight" data-testid="text-agent-name">{agent.name}</h1>
            <p className="text-xs text-muted-foreground">Live Interview</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2" title="Maximizes voice isolation and turn-taking patience for loud venues. Applies to the next session.">
            <span className="text-xs text-muted-foreground">Noisy environment</span>
            <Switch
              checked={!!voiceSettings?.noisyEnvironment}
              disabled={!voiceSettings || noisyMutation.isPending}
              onCheckedChange={(checked) => noisyMutation.mutate(checked)}
              data-testid="switch-noisy-environment"
            />
          </div>
          {avatarStreaming && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={endInterview}
              data-testid="button-end-interview"
            >
              <VideoOff className="w-4 h-4" />
              End Interview
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 grid lg:grid-cols-2 gap-6 p-6 overflow-hidden">
        {/* Avatar column */}
        <div className="flex flex-col">
          <div
            ref={avatarContainerRef}
            className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 flex-1 flex items-center justify-center [&:fullscreen]:rounded-none [&:fullscreen]:border-none"
          >
            <video
              id="launch-anam-video"
              ref={avatarVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full [&:fullscreen]:object-contain ${avatarStreaming ? "block" : "hidden"}`}
              style={{ objectFit: "cover" }}
              data-testid="video-avatar"
            />

            {!avatarStreaming && !avatarLoading && (
              <div className="flex flex-col items-center justify-center gap-4 py-16">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/20 to-cyan-400/20 border border-white/10 flex items-center justify-center">
                  <User className="w-10 h-10 text-primary/60" />
                </div>
                {interviewEnded ? (
                  <>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400" /> Interview ended
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 bg-white/5 hover:bg-white/10"
                      onClick={startInterview}
                      data-testid="button-restart-interview"
                    >
                      <Video className="w-4 h-4 mr-2" /> Start New Interview
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Ready when you are.</p>
                    <Button
                      className="bg-gradient-to-r from-primary to-cyan-400 text-black font-medium hover:opacity-90"
                      onClick={startInterview}
                      data-testid="button-start-interview"
                    >
                      <Video className="w-4 h-4 mr-2" /> Start Interview
                    </Button>
                  </>
                )}
              </div>
            )}

            {avatarLoading && (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Connecting to avatar...</p>
              </div>
            )}

            {avatarStreaming && (
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse inline-block" />
                  Live
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 bg-black/50 hover:bg-black/70 text-white rounded-full"
                  onClick={toggleAvatarFullscreen}
                  data-testid="button-avatar-fullscreen"
                  title={avatarFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {avatarFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            )}

            {avatarError && (
              <div className="absolute bottom-0 inset-x-0 px-4 py-2 bg-red-500/10 border-t border-red-500/20">
                <p className="text-xs text-red-400" data-testid="text-avatar-error">{avatarError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Transcript column */}
        <div className="flex flex-col rounded-2xl border border-white/10 bg-card/30 overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
            <h2 className="font-medium text-sm">Transcript</h2>
            {chatMessages.length > 0 && (
              <span className="text-xs text-muted-foreground" data-testid="text-message-count">
                {chatMessages.length} messages
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
            {chatMessages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center">
                <p className="text-sm text-muted-foreground max-w-xs" data-testid="text-empty-transcript">
                  The conversation will appear here once the interview begins.
                </p>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`} data-testid={`message-${i}`}>
                  <Avatar className="h-8 w-8 border border-primary/50 shrink-0">
                    <AvatarFallback className={msg.role === "user" ? "bg-purple-500 text-white font-bold text-xs" : "bg-primary text-black font-bold text-xs"}>
                      {msg.role === "user" ? "U" : "AI"}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`space-y-1 max-w-[80%] ${msg.role === "user" ? "items-end" : ""}`}>
                    <div className="text-xs font-medium text-muted-foreground">
                      {msg.role === "user" ? "You" : agent.name}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "rounded-tr-none bg-purple-500/10 border border-purple-500/20"
                        : "rounded-tl-none bg-white/5 border border-white/10"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Summary section */}
          {(summaryLoading || summary) && (
            <div className="border-t border-white/5 p-5 max-h-[45%] overflow-y-auto bg-background/40">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" /> Summary
                </h3>
                {summary && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 bg-white/5 hover:bg-white/10 h-7"
                    onClick={handleDownloadSummary}
                    data-testid="button-download-summary"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                  </Button>
                )}
              </div>
              {summaryLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-summary-loading">
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating summary...
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90" data-testid="text-summary">
                  {summary}
                </pre>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
