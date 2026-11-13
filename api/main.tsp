import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;

@service(#{ title: "Календарь звонков" })
namespace Calendar;

@doc("Часы владельца календаря; время начала и окончания указано в Europe/Moscow.")
model BookingSettings {
  timezone: "Europe/Moscow";
  opensAt: "09:00";
  closesAt: "18:00";
  slotStepMinutes: 30;
  bookingWindowDays: 14;
}

model EventType {
  @pattern("^[a-z0-9-]{1,64}$")
  id: string;
  name: string;
  description: string;
  durationMinutes: int32;
}

model CreateEventType {
  @pattern("^[a-z0-9-]{1,64}$")
  id: string;
  @minLength(1) @maxLength(100)
  name: string;
  @minLength(1) @maxLength(1000)
  description: string;
  @minValue(1) @maxValue(540)
  durationMinutes: int32;
}

model UpdateEventType {
  @minLength(1) @maxLength(100)
  name: string;
  @minLength(1) @maxLength(1000)
  description: string;
  @minValue(1) @maxValue(540)
  durationMinutes: int32;
}

model DeleteEventTypeResult {
  deleted: true;
}

model ErrorDetail {
  code: string;
  message: string;
}

model BadRequest {
  @statusCode statusCode: 400;
  @body error: ErrorDetail;
}
model NotFound {
  @statusCode statusCode: 404;
  @body error: ErrorDetail;
}
model Conflict {
  @statusCode statusCode: 409;
  @body error: ErrorDetail;
}

@doc("Начало по получасовой сетке. Причина указывается только для недоступного слота.")
model Slot {
  startsAt: utcDateTime;
  available: boolean;
  reason?: "past" | "booked" | "does_not_fit";
}

model SlotsResponse {
  date: plainDate;
  slots: Slot[];
}

model CreateBooking {
  eventTypeId: string;
  startsAt: utcDateTime;
  @minLength(1) @maxLength(100)
  guestName: string;
  @format("email") @maxLength(254)
  guestEmail: string;
}

model BookingConfirmation {
  confirmed: true;
}

model DeleteBookingResult {
  deleted: true;
}

model UpcomingBooking {
  id: int32;
  eventType: EventType;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
  guestName: string;
  guestEmail: string;
}

@route("/api")
interface CalendarApi {
  @get @route("/booking-settings")
  getBookingSettings(): BookingSettings;

  @get @route("/event-types")
  listEventTypes(): EventType[];

  @post @route("/event-types")
  createEventType(@body input: CreateEventType): EventType | BadRequest | Conflict;

  @patch @route("/event-types/{id}")
  updateEventType(@path id: string, @body input: UpdateEventType): EventType | BadRequest | NotFound;

  @delete @route("/event-types/{id}")
  deleteEventType(@path id: string): DeleteEventTypeResult | NotFound | Conflict;

  @get @route("/event-types/{id}/slots")
  listSlots(@path id: string, @query date: plainDate): SlotsResponse | BadRequest | NotFound;

  @post @route("/bookings")
  createBooking(@body input: CreateBooking): BookingConfirmation | BadRequest | NotFound | Conflict;

  @get @route("/admin/bookings")
  listUpcomingBookings(): UpcomingBooking[];

  @delete @route("/admin/bookings/{id}")
  deleteBooking(@path id: int32): DeleteBookingResult | NotFound;
}
