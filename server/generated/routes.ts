// Generated from api/main.tsp. Do not edit.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { CalendarApiListUpcomingBookingsData, CalendarApiListUpcomingBookingsResponse, CalendarApiDeleteBookingData, CalendarApiDeleteBookingResponse, CalendarApiGetBookingSettingsData, CalendarApiGetBookingSettingsResponse, CalendarApiCreateBookingData, CalendarApiCreateBookingResponse, CalendarApiListEventTypesData, CalendarApiListEventTypesResponse, CalendarApiCreateEventTypeData, CalendarApiCreateEventTypeResponse, CalendarApiUpdateEventTypeData, CalendarApiUpdateEventTypeResponse, CalendarApiDeleteEventTypeData, CalendarApiDeleteEventTypeResponse, CalendarApiListSlotsData, CalendarApiListSlotsResponse } from './types.js'
import { routeSchemas } from './schemas.js'

export interface CalendarHandlers {
  CalendarApi_listUpcomingBookings: (request: FastifyRequest<{ Body: CalendarApiListUpcomingBookingsData['body']; Params: CalendarApiListUpcomingBookingsData['path']; Querystring: CalendarApiListUpcomingBookingsData['query'] }>, reply: FastifyReply) => CalendarApiListUpcomingBookingsResponse | Promise<CalendarApiListUpcomingBookingsResponse>;
  CalendarApi_deleteBooking: (request: FastifyRequest<{ Body: CalendarApiDeleteBookingData['body']; Params: CalendarApiDeleteBookingData['path']; Querystring: CalendarApiDeleteBookingData['query'] }>, reply: FastifyReply) => CalendarApiDeleteBookingResponse | Promise<CalendarApiDeleteBookingResponse>;
  CalendarApi_getBookingSettings: (request: FastifyRequest<{ Body: CalendarApiGetBookingSettingsData['body']; Params: CalendarApiGetBookingSettingsData['path']; Querystring: CalendarApiGetBookingSettingsData['query'] }>, reply: FastifyReply) => CalendarApiGetBookingSettingsResponse | Promise<CalendarApiGetBookingSettingsResponse>;
  CalendarApi_createBooking: (request: FastifyRequest<{ Body: CalendarApiCreateBookingData['body']; Params: CalendarApiCreateBookingData['path']; Querystring: CalendarApiCreateBookingData['query'] }>, reply: FastifyReply) => CalendarApiCreateBookingResponse | Promise<CalendarApiCreateBookingResponse>;
  CalendarApi_listEventTypes: (request: FastifyRequest<{ Body: CalendarApiListEventTypesData['body']; Params: CalendarApiListEventTypesData['path']; Querystring: CalendarApiListEventTypesData['query'] }>, reply: FastifyReply) => CalendarApiListEventTypesResponse | Promise<CalendarApiListEventTypesResponse>;
  CalendarApi_createEventType: (request: FastifyRequest<{ Body: CalendarApiCreateEventTypeData['body']; Params: CalendarApiCreateEventTypeData['path']; Querystring: CalendarApiCreateEventTypeData['query'] }>, reply: FastifyReply) => CalendarApiCreateEventTypeResponse | Promise<CalendarApiCreateEventTypeResponse>;
  CalendarApi_updateEventType: (request: FastifyRequest<{ Body: CalendarApiUpdateEventTypeData['body']; Params: CalendarApiUpdateEventTypeData['path']; Querystring: CalendarApiUpdateEventTypeData['query'] }>, reply: FastifyReply) => CalendarApiUpdateEventTypeResponse | Promise<CalendarApiUpdateEventTypeResponse>;
  CalendarApi_deleteEventType: (request: FastifyRequest<{ Body: CalendarApiDeleteEventTypeData['body']; Params: CalendarApiDeleteEventTypeData['path']; Querystring: CalendarApiDeleteEventTypeData['query'] }>, reply: FastifyReply) => CalendarApiDeleteEventTypeResponse | Promise<CalendarApiDeleteEventTypeResponse>;
  CalendarApi_listSlots: (request: FastifyRequest<{ Body: CalendarApiListSlotsData['body']; Params: CalendarApiListSlotsData['path']; Querystring: CalendarApiListSlotsData['query'] }>, reply: FastifyReply) => CalendarApiListSlotsResponse | Promise<CalendarApiListSlotsResponse>;
}

/** Register only after supplying handwritten business handlers. */
export function registerCalendarRoutes(app: FastifyInstance, handlers: CalendarHandlers): void {
  app.get("/api/admin/bookings", { schema: routeSchemas.CalendarApi_listUpcomingBookings }, handlers.CalendarApi_listUpcomingBookings)
  app.delete("/api/admin/bookings/:id", { schema: routeSchemas.CalendarApi_deleteBooking }, handlers.CalendarApi_deleteBooking)
  app.get("/api/booking-settings", { schema: routeSchemas.CalendarApi_getBookingSettings }, handlers.CalendarApi_getBookingSettings)
  app.post("/api/bookings", { schema: routeSchemas.CalendarApi_createBooking }, handlers.CalendarApi_createBooking)
  app.get("/api/event-types", { schema: routeSchemas.CalendarApi_listEventTypes }, handlers.CalendarApi_listEventTypes)
  app.post("/api/event-types", { schema: routeSchemas.CalendarApi_createEventType }, handlers.CalendarApi_createEventType)
  app.patch("/api/event-types/:id", { schema: routeSchemas.CalendarApi_updateEventType }, handlers.CalendarApi_updateEventType)
  app.delete("/api/event-types/:id", { schema: routeSchemas.CalendarApi_deleteEventType }, handlers.CalendarApi_deleteEventType)
  app.get("/api/event-types/:id/slots", { schema: routeSchemas.CalendarApi_listSlots }, handlers.CalendarApi_listSlots)
}
