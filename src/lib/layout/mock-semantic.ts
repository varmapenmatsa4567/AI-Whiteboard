import type { SemanticDiagram } from "./model";

export function semanticMockForPrompt(prompt: string): SemanticDiagram | null {
  if (!/microservice|api gateway|api-gateway/i.test(prompt)) return null;
  return {
    description: "Microservices architecture with an API Gateway and backend services.",
    direction: "left-to-right",
    nodes: [
      { id: "client", type: "card", title: "Client", description: "Web or mobile application" },
      { id: "gateway", type: "card", title: "API Gateway", description: "Single entry point for client requests", items: ["Authentication", "Rate limiting", "Routing"] },
      { id: "users", type: "card", title: "User Service", description: "Owns user data and profile operations" },
      { id: "orders", type: "card", title: "Order Service", description: "Creates and tracks orders" },
      { id: "payments", type: "card", title: "Payment Service", description: "Processes payment operations" },
      { id: "database", type: "card", title: "Service Databases", description: "Each service owns its data" },
    ],
    edges: [
      { id: "e1", source: "client", target: "gateway", label: "HTTPS" },
      { id: "e2", source: "gateway", target: "users", label: "route" },
      { id: "e3", source: "gateway", target: "orders", label: "route" },
      { id: "e4", source: "gateway", target: "payments", label: "route" },
      { id: "e5", source: "users", target: "database" },
      { id: "e6", source: "orders", target: "database" },
      { id: "e7", source: "payments", target: "database" },
    ],
    groups: [],
  };
}
