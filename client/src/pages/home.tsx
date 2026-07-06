import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mic, BarChart2, ArrowRight, Radio, Layers, Bot, Trash2, Play, User, Globe, Cpu, MessageSquare, Pencil, Rocket, Copy, Check, ExternalLink, Loader2, Phone } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { agentsApi, interviewLinksApi, phoneApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Agent, InsertAgent } from "@shared/schema";
import heroBg from "@assets/generated_images/Abstract_sound_waves_visualization_010bae0d.png";

const LLM_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o (OpenAI)" },
  { value: "gpt-4", label: "GPT-4 (OpenAI)" },
  { value: "claude-3", label: "Claude 3 (Anthropic)" },
  { value: "gemini-pro", label: "Gemini Pro (Google)" },
];

const VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy" },
  { value: "echo", label: "Echo" },
  { value: "fable", label: "Fable" },
  { value: "onyx", label: "Onyx" },
  { value: "nova", label: "Nova" },
  { value: "shimmer", label: "Shimmer" },
];

const LANGUAGE_OPTIONS = [
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Japanese", label: "Japanese" },
  { value: "Chinese", label: "Chinese" },
];

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "neutral", label: "Neutral" },
];

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    systemPrompt: "",
    llmModel: "",
    voiceModel: "",
    language: "",
    gender: "",
  });

  const [shareAgent, setShareAgent] = useState<Agent | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createLinkMutation = useMutation({
    mutationFn: (agentId: number) => interviewLinksApi.create(agentId),
    onSuccess: (link) => {
      setShareUrl(`${window.location.origin}/interview/${link.token}`);
      setCopied(false);
    },
    onError: (error) => {
      toast({
        title: "Could not create link",
        description: error.message,
        variant: "destructive",
      });
      setShareAgent(null);
    },
  });

  const handleLaunchClick = (agent: Agent) => {
    setShareAgent(agent);
    setShareUrl(null);
    setCopied(false);
    createLinkMutation.mutate(agent.id);
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast({ title: "Link copied", description: "Share it with your interviewer." });
    setTimeout(() => setCopied(false), 2000);
  };
  
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: agentsApi.getAll,
  });

  const { data: phoneConfig } = useQuery({
    queryKey: ["phone-config"],
    queryFn: phoneApi.getConfig,
  });

  const [phoneAgentSelection, setPhoneAgentSelection] = useState<string>("");

  const assignPhoneAgentMutation = useMutation({
    mutationFn: (agentId: number) => phoneApi.assignAgent(agentId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["phone-config"] });
      toast({
        title: "Phone agent updated",
        description: `${result.agentName} now answers calls to ${result.phoneNumber}.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Could not update phone agent",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: (id: number) => agentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast({
        title: "Agent Deleted",
        description: "The agent has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertAgent> }) => 
      agentsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setEditingAgent(null);
      toast({
        title: "Agent Updated",
        description: "Your changes have been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditClick = (agent: Agent) => {
    setLocation(`/build?agentId=${agent.id}`);
  };

  const handleSaveEdit = () => {
    if (!editingAgent) return;
    updateAgentMutation.mutate({
      id: editingAgent.id,
      data: editForm,
    });
  };

  const latestAgent = agents.length > 0 ? agents[agents.length - 1] : null;

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden font-sans">
      <div className="absolute inset-0 z-0 opacity-20">
        <img 
          src={heroBg} 
          alt="Background" 
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-20 flex flex-col items-center justify-center min-h-screen">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-3xl"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
            <Bot className="w-4 h-4" />
            <span>Next-Gen Voice Agents</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-bold mb-6 tracking-tight leading-tight">
            Webex <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">Voice Agent Studio</span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Design personalized voice agents for the Webex ecosystem. 
            Build custom personas and evaluate speech quality in real-time.
          </p>
          {agents.length > 0 && (
            <p className="text-sm text-muted-foreground mt-4" data-testid="text-agent-count">
              {agents.length} agent{agents.length !== 1 ? 's' : ''} created
            </p>
          )}
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
          <Link href="/build">
            <motion.div 
              whileHover={{ scale: 1.02, translateY: -5 }}
              whileTap={{ scale: 0.98 }}
              className="group cursor-pointer relative overflow-hidden rounded-3xl border border-white/10 bg-card/50 backdrop-blur-sm p-8 hover:bg-card/80 transition-all duration-300 shadow-lg hover:shadow-primary/20 hover:border-primary/50"
              data-testid="card-build-mode"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <Layers className="w-32 h-32 -mt-10 -mr-10" />
              </div>
              
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
                <Mic className="w-7 h-7 text-white" />
              </div>
              
              <h2 className="text-2xl font-display font-bold mb-3 group-hover:text-primary transition-colors">Build Agent</h2>
              <p className="text-muted-foreground mb-8">
                Configure voice, language, gender, and LLM backend to create a unique podcasting persona.
              </p>
              
              <div className="flex items-center text-sm font-medium text-primary group-hover:translate-x-1 transition-transform">
                Start Building <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </motion.div>
          </Link>

          <Link href={latestAgent ? `/evaluate?agentId=${latestAgent.id}` : "/build"}>
            <motion.div 
              whileHover={{ scale: 1.02, translateY: -5 }}
              whileTap={{ scale: 0.98 }}
              className="group cursor-pointer relative overflow-hidden rounded-3xl border border-white/10 bg-card/50 backdrop-blur-sm p-8 hover:bg-card/80 transition-all duration-300 shadow-lg hover:shadow-purple-500/20 hover:border-purple-500/50"
              data-testid="card-evaluate-mode"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <Radio className="w-32 h-32 -mt-10 -mr-10" />
              </div>
              
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-400 flex items-center justify-center mb-6 shadow-lg shadow-purple-500/20">
                <BarChart2 className="w-7 h-7 text-white" />
              </div>
              
              <h2 className="text-2xl font-display font-bold mb-3 group-hover:text-purple-400 transition-colors">Evaluate</h2>
              <p className="text-muted-foreground mb-8">
                Test text-to-speech quality attributes, naturalness, and analyze agent responses.
              </p>
              
              <div className="flex items-center text-sm font-medium text-purple-400 group-hover:translate-x-1 transition-transform">
                {latestAgent ? `Evaluate ${latestAgent.name}` : "Create an Agent First"} <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </motion.div>
          </Link>
        </div>

        {agents.length > 0 && phoneConfig?.configured && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="w-full max-w-4xl mt-16"
          >
            <Card className="p-6 bg-card/50 backdrop-blur-sm border-white/10" data-testid="card-phone-line">
              <div className="flex flex-col md:flex-row md:items-center gap-5 md:justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-400/20 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-6 h-6 text-green-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-lg">Phone Line</h3>
                    <p className="text-sm text-muted-foreground">
                      Call <span className="font-medium text-foreground" data-testid="text-phone-number">{phoneConfig.phoneNumber}</span>
                      {phoneConfig.agentName ? (
                        <> to talk to <span className="font-medium text-foreground" data-testid="text-phone-agent">{phoneConfig.agentName}</span></>
                      ) : (
                        <> — assign an agent to answer calls</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Select
                    value={phoneAgentSelection || (phoneConfig.agentId ? String(phoneConfig.agentId) : "")}
                    onValueChange={setPhoneAgentSelection}
                  >
                    <SelectTrigger className="w-[220px]" data-testid="select-phone-agent">
                      <SelectValue placeholder="Choose an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={String(agent.id)} data-testid={`option-phone-agent-${agent.id}`}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="gap-2 bg-gradient-to-r from-green-500 to-emerald-400 text-black font-medium hover:opacity-90"
                    disabled={
                      assignPhoneAgentMutation.isPending ||
                      !(phoneAgentSelection || phoneConfig.agentId) ||
                      Number(phoneAgentSelection || 0) === (phoneConfig.agentId ?? -1)
                    }
                    onClick={() => {
                      const id = Number(phoneAgentSelection || phoneConfig.agentId);
                      if (id) assignPhoneAgentMutation.mutate(id);
                    }}
                    data-testid="button-assign-phone-agent"
                  >
                    {assignPhoneAgentMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Phone className="w-4 h-4" />
                    )}
                    {phoneConfig.agentId ? "Change Agent" : "Assign Agent"}
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {agents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-4xl mt-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold">Your Agents</h2>
              <span className="text-sm text-muted-foreground">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
            </div>
            
            <div className="grid gap-4">
              {agents.map((agent) => (
                <Card 
                  key={agent.id} 
                  className="p-5 bg-card/50 backdrop-blur-sm border-white/10 hover:border-white/20 transition-colors"
                  data-testid={`card-agent-${agent.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                          <Bot className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg" data-testid={`text-agent-name-${agent.id}`}>{agent.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            Created {new Date(agent.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Cpu className="w-4 h-4" />
                          <span className="truncate" data-testid={`text-agent-llm-${agent.id}`}>{agent.llmModel}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mic className="w-4 h-4" />
                          <span className="truncate capitalize" data-testid={`text-agent-voice-${agent.id}`}>{agent.voiceModel}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Globe className="w-4 h-4" />
                          <span className="truncate" data-testid={`text-agent-language-${agent.id}`}>{agent.language}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="w-4 h-4" />
                          <span className="truncate capitalize" data-testid={`text-agent-gender-${agent.id}`}>{agent.gender}</span>
                        </div>
                      </div>

                      {agent.systemPrompt && (
                        <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                          <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <p className="line-clamp-2" data-testid={`text-agent-prompt-${agent.id}`}>{agent.systemPrompt}</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="gap-2"
                        onClick={() => handleEditClick(agent)}
                        data-testid={`button-edit-agent-${agent.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </Button>
                      <Link href={`/evaluate?agentId=${agent.id}`}>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="gap-2"
                          data-testid={`button-evaluate-agent-${agent.id}`}
                        >
                          <Mic className="w-4 h-4" />
                          Chat
                        </Button>
                      </Link>
                      <Button 
                        size="sm"
                        className="gap-2 bg-gradient-to-r from-primary to-cyan-400 text-black font-medium hover:opacity-90"
                        onClick={() => handleLaunchClick(agent)}
                        disabled={createLinkMutation.isPending && shareAgent?.id === agent.id}
                        data-testid={`button-launch-agent-${agent.id}`}
                      >
                        {createLinkMutation.isPending && shareAgent?.id === agent.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Rocket className="w-4 h-4" />
                        )}
                        Launch
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteAgentMutation.mutate(agent.id)}
                        disabled={deleteAgentMutation.isPending}
                        data-testid={`button-delete-agent-${agent.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <Dialog open={!!editingAgent} onOpenChange={(open) => !open && setEditingAgent(null)}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-edit-agent">
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                data-testid="input-edit-name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-prompt">System Prompt</Label>
              <Textarea
                id="edit-prompt"
                value={editForm.systemPrompt}
                onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })}
                rows={4}
                placeholder="Describe the persona and behavior of your AI agent..."
                data-testid="input-edit-prompt"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>LLM Model</Label>
                <Select
                  value={editForm.llmModel}
                  onValueChange={(value) => setEditForm({ ...editForm, llmModel: value })}
                >
                  <SelectTrigger data-testid="select-edit-llm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LLM_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Voice Model</Label>
                <Select
                  value={editForm.voiceModel}
                  onValueChange={(value) => setEditForm({ ...editForm, voiceModel: value })}
                >
                  <SelectTrigger data-testid="select-edit-voice">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Language</Label>
                <Select
                  value={editForm.language}
                  onValueChange={(value) => setEditForm({ ...editForm, language: value })}
                >
                  <SelectTrigger data-testid="select-edit-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Gender</Label>
                <Select
                  value={editForm.gender}
                  onValueChange={(value) => setEditForm({ ...editForm, gender: value })}
                >
                  <SelectTrigger data-testid="select-edit-gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditingAgent(null)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={updateAgentMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateAgentMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!shareAgent} onOpenChange={(open) => { if (!open) { setShareAgent(null); setShareUrl(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-share-title">
              Share interview link{shareAgent ? ` — ${shareAgent.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Send this link to whoever will be conducting the interview. Anyone with the link can open the interview page.
            </p>
            {createLinkMutation.isPending || !shareUrl ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4" data-testid="status-link-loading">
                <Loader2 className="w-4 h-4 animate-spin" /> Generating a new link...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="font-mono text-xs"
                  onFocus={(e) => e.target.select()}
                  data-testid="input-share-url"
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleCopyLink}
                  data-testid="button-copy-link"
                  title="Copy link"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {shareUrl && (
              <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="inline-flex">
                <Button variant="outline" className="gap-2" data-testid="link-open-interview">
                  <ExternalLink className="w-4 h-4" /> Open
                </Button>
              </a>
            )}
            <Button
              className="gap-2 bg-gradient-to-r from-primary to-cyan-400 text-black font-medium hover:opacity-90"
              onClick={handleCopyLink}
              disabled={!shareUrl}
              data-testid="button-copy-link-main"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
