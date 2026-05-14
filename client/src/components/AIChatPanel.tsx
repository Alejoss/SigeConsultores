/**
 * AI Chat Panel Component
 * Reusable chat interface for AI interactions across modules
 * Displays conversation history and handles user input
 */

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, X, ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  feedback?: "helpful" | "not_helpful";
  isLoading?: boolean;
}

interface AIChatPanelProps {
  title?: string;
  placeholder?: string;
  onSendMessage: (message: string) => Promise<string>;
  isLoading?: boolean;
  onClose?: () => void;
  className?: string;
  maxHeight?: string;
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  title = "Asesor IA",
  placeholder = "Escribe tu pregunta...",
  onSendMessage,
  isLoading = false,
  onClose,
  className,
  maxHeight = "h-96",
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Call the handler function
      const response = await onSendMessage(input);

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-response`,
        role: "assistant",
        content: response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      // Add error message
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "No se pudo obtener respuesta"}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFeedback = (messageId: string, feedback: "helpful" | "not_helpful") => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, feedback } : msg
      )
    );
  };

  return (
    <Card className={cn("flex flex-col bg-white border border-gray-200", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className={cn("flex-1 overflow-y-auto p-4 space-y-4", maxHeight)}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            <p>Comienza escribiendo una pregunta...</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-xs lg:max-w-md px-4 py-2 rounded-lg",
                  message.role === "user"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-gray-100 text-gray-900 rounded-bl-none"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                {/* Feedback buttons for assistant messages */}
                {message.role === "assistant" && !message.feedback && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-gray-300">
                    <button
                      onClick={() => handleFeedback(message.id, "helpful")}
                      className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
                      title="Respuesta útil"
                    >
                      <ThumbsUp className="w-3 h-3" />
                      Útil
                    </button>
                    <button
                      onClick={() => handleFeedback(message.id, "not_helpful")}
                      className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
                      title="Respuesta no útil"
                    >
                      <ThumbsDown className="w-3 h-3" />
                      No útil
                    </button>
                  </div>
                )}

                {/* Feedback indicator */}
                {message.feedback && (
                  <div className="text-xs text-gray-500 mt-1">
                    {message.feedback === "helpful" ? "✓ Marcado como útil" : "✗ Marcado como no útil"}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg rounded-bl-none">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Pensando...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={loading || isLoading}
            className="flex-1 text-sm"
          />
          <Button
            onClick={handleSendMessage}
            disabled={loading || isLoading || !input.trim()}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading || isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Presiona Enter para enviar, Shift+Enter para nueva línea
        </p>
      </div>
    </Card>
  );
};

export default AIChatPanel;
