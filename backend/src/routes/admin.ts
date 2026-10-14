import { Router } from "express";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { PERMISSIONS } from "../auth/rbac.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  getUsers, getUser, postUser, patchUser, postDeactivate, postActivate,
  postAssignRole, postResetUserMfa, getOrganizations,
} from "../controllers/userController.js";
import {
  getEvents, getEvent, getSummary, getRisk, getRiskForSubject, getRules,
  getSimulations, runSimulationScenario, simulationPing,
} from "../controllers/securityController.js";
import {
  getIncidents, postIncident, getIncidentById, patchIncident, postIncidentAction,
  postReverseAction, postResolve, postFalsePositive,
} from "../controllers/incidentController.js";
import { getAudit, getAuditById, getIntegrity, getExport } from "../controllers/auditController.js";

export const usersRouter = Router();
usersRouter.use(authenticate);
usersRouter.get("/", requirePermission(PERMISSIONS.USER_VIEW), getUsers);
usersRouter.get("/organizations", requirePermission(PERMISSIONS.USER_VIEW), getOrganizations);
usersRouter.post("/", requirePermission(PERMISSIONS.USER_CREATE), postUser);
usersRouter.get("/:id", requirePermission(PERMISSIONS.USER_VIEW), getUser);
usersRouter.patch("/:id", requirePermission(PERMISSIONS.USER_UPDATE), patchUser);
usersRouter.post("/:id/deactivate", requirePermission(PERMISSIONS.USER_DEACTIVATE), postDeactivate);
usersRouter.post("/:id/activate", requirePermission(PERMISSIONS.USER_DEACTIVATE), postActivate);
usersRouter.post("/:id/role", requirePermission(PERMISSIONS.ROLE_ASSIGN), postAssignRole);
usersRouter.post("/:id/mfa/reset", requirePermission(PERMISSIONS.USER_UPDATE), postResetUserMfa);

export const securityRouter = Router();
// The simulation ping endpoint must be reachable by the simulation driver (same origin, authenticated admin triggers it).
securityRouter.post("/simulations/_ping", rateLimit({ category: "sim-ping", windowMs: 60_000, max: 15, by: "ip" }), simulationPing);
securityRouter.use(authenticate, requirePermission(PERMISSIONS.SECURITY_VIEW));
securityRouter.get("/events", getEvents);
securityRouter.get("/events/:id", getEvent);
securityRouter.get("/summary", getSummary);
securityRouter.get("/risk", getRisk);
securityRouter.get("/risk/:subjectId", getRiskForSubject);
securityRouter.get("/rules", getRules);
securityRouter.get("/simulations", getSimulations);
securityRouter.post("/simulations/:scenario/run", requirePermission(PERMISSIONS.SECURITY_CONFIGURE), runSimulationScenario);

export const incidentsRouter = Router();
incidentsRouter.use(authenticate, requirePermission(PERMISSIONS.INCIDENT_VIEW));
incidentsRouter.get("/", getIncidents);
incidentsRouter.post("/", requirePermission(PERMISSIONS.INCIDENT_RESPOND), postIncident);
incidentsRouter.get("/:id", getIncidentById);
incidentsRouter.patch("/:id", requirePermission(PERMISSIONS.INCIDENT_RESPOND), patchIncident);
incidentsRouter.post("/:id/actions", requirePermission(PERMISSIONS.INCIDENT_RESPOND), postIncidentAction);
incidentsRouter.post("/:id/resolve", requirePermission(PERMISSIONS.INCIDENT_RESPOND), postResolve);
incidentsRouter.post("/:id/false-positive", requirePermission(PERMISSIONS.INCIDENT_RESPOND), postFalsePositive);
incidentsRouter.post("/actions/:actionId/reverse", requirePermission(PERMISSIONS.INCIDENT_RESPOND), postReverseAction);

export const auditRouter = Router();
auditRouter.use(authenticate, requirePermission(PERMISSIONS.AUDIT_VIEW));
auditRouter.get("/", getAudit);
auditRouter.get("/integrity", getIntegrity);
auditRouter.get("/export", getExport);
auditRouter.get("/:id", getAuditById);
