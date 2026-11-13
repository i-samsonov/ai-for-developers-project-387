// Generated from api/main.tsp. Do not edit.
export const routeSchemas = {
  "CalendarApi_listUpcomingBookings": {
    "response": {
      "200": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "id",
            "eventType",
            "startsAt",
            "endsAt",
            "guestName",
            "guestEmail"
          ],
          "properties": {
            "id": {
              "type": "integer",
              "format": "int32"
            },
            "eventType": {
              "type": "object",
              "required": [
                "id",
                "name",
                "description",
                "durationMinutes"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "pattern": "^[a-z0-9-]{1,64}$"
                },
                "name": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                },
                "durationMinutes": {
                  "type": "integer",
                  "format": "int32"
                }
              }
            },
            "startsAt": {
              "type": "string",
              "format": "date-time"
            },
            "endsAt": {
              "type": "string",
              "format": "date-time"
            },
            "guestName": {
              "type": "string"
            },
            "guestEmail": {
              "type": "string"
            }
          }
        }
      }
    }
  },
  "CalendarApi_deleteBooking": {
    "params": {
      "type": "object",
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "integer",
          "format": "int32"
        }
      },
      "additionalProperties": false
    },
    "response": {
      "200": {
        "type": "object",
        "required": [
          "deleted"
        ],
        "properties": {
          "deleted": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      },
      "404": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
    }
  },
  "CalendarApi_getBookingSettings": {
    "response": {
      "200": {
        "type": "object",
        "required": [
          "timezone",
          "opensAt",
          "closesAt",
          "slotStepMinutes",
          "bookingWindowDays"
        ],
        "properties": {
          "timezone": {
            "type": "string",
            "enum": [
              "Europe/Moscow"
            ]
          },
          "opensAt": {
            "type": "string",
            "enum": [
              "09:00"
            ]
          },
          "closesAt": {
            "type": "string",
            "enum": [
              "18:00"
            ]
          },
          "slotStepMinutes": {
            "type": "number",
            "enum": [
              30
            ]
          },
          "bookingWindowDays": {
            "type": "number",
            "enum": [
              14
            ]
          }
        },
        "description": "Часы владельца календаря; время начала и окончания указано в Europe/Moscow."
      }
    }
  },
  "CalendarApi_createBooking": {
    "body": {
      "type": "object",
      "required": [
        "eventTypeId",
        "startsAt",
        "guestName",
        "guestEmail"
      ],
      "properties": {
        "eventTypeId": {
          "type": "string"
        },
        "startsAt": {
          "type": "string",
          "format": "date-time"
        },
        "guestName": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "guestEmail": {
          "type": "string",
          "maxLength": 254,
          "format": "email"
        }
      }
    },
    "response": {
      "200": {
        "type": "object",
        "required": [
          "confirmed"
        ],
        "properties": {
          "confirmed": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      },
      "400": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      },
      "404": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      },
      "409": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
    }
  },
  "CalendarApi_listEventTypes": {
    "response": {
      "200": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "id",
            "name",
            "description",
            "durationMinutes"
          ],
          "properties": {
            "id": {
              "type": "string",
              "pattern": "^[a-z0-9-]{1,64}$"
            },
            "name": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "durationMinutes": {
              "type": "integer",
              "format": "int32"
            }
          }
        }
      }
    }
  },
  "CalendarApi_createEventType": {
    "body": {
      "type": "object",
      "required": [
        "id",
        "name",
        "description",
        "durationMinutes"
      ],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-z0-9-]{1,64}$"
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "description": {
          "type": "string",
          "minLength": 1,
          "maxLength": 1000
        },
        "durationMinutes": {
          "type": "integer",
          "format": "int32",
          "minimum": 1,
          "maximum": 540
        }
      }
    },
    "response": {
      "200": {
        "type": "object",
        "required": [
          "id",
          "name",
          "description",
          "durationMinutes"
        ],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9-]{1,64}$"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "durationMinutes": {
            "type": "integer",
            "format": "int32"
          }
        }
      },
      "400": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      },
      "409": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
    }
  },
  "CalendarApi_updateEventType": {
    "body": {
      "type": "object",
      "required": [
        "name",
        "description",
        "durationMinutes"
      ],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "description": {
          "type": "string",
          "minLength": 1,
          "maxLength": 1000
        },
        "durationMinutes": {
          "type": "integer",
          "format": "int32",
          "minimum": 1,
          "maximum": 540
        }
      }
    },
    "params": {
      "type": "object",
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string"
        }
      },
      "additionalProperties": false
    },
    "response": {
      "200": {
        "type": "object",
        "required": [
          "id",
          "name",
          "description",
          "durationMinutes"
        ],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9-]{1,64}$"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "durationMinutes": {
            "type": "integer",
            "format": "int32"
          }
        }
      },
      "400": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      },
      "404": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
    }
  },
  "CalendarApi_deleteEventType": {
    "params": {
      "type": "object",
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string"
        }
      },
      "additionalProperties": false
    },
    "response": {
      "200": {
        "type": "object",
        "required": [
          "deleted"
        ],
        "properties": {
          "deleted": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      },
      "404": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      },
      "409": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
    }
  },
  "CalendarApi_listSlots": {
    "params": {
      "type": "object",
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string"
        }
      },
      "additionalProperties": false
    },
    "querystring": {
      "type": "object",
      "required": [
        "date"
      ],
      "properties": {
        "date": {
          "type": "string",
          "format": "date"
        }
      },
      "additionalProperties": false
    },
    "response": {
      "200": {
        "type": "object",
        "required": [
          "date",
          "slots"
        ],
        "properties": {
          "date": {
            "type": "string",
            "format": "date"
          },
          "slots": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "startsAt",
                "available"
              ],
              "properties": {
                "startsAt": {
                  "type": "string",
                  "format": "date-time"
                },
                "available": {
                  "type": "boolean"
                },
                "reason": {
                  "type": "string",
                  "enum": [
                    "past",
                    "booked",
                    "does_not_fit"
                  ]
                }
              },
              "description": "Начало по получасовой сетке. Причина указывается только для недоступного слота."
            }
          }
        }
      },
      "400": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      },
      "404": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
    }
  }
} as const
