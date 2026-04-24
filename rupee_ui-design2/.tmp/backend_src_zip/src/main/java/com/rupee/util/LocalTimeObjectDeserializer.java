package com.rupee.util;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.time.LocalTime;
import java.time.ZoneOffset;

/**
 * Custom deserializer to handle frontend time picker objects:
 * { "hour": 3, "minute": 30, "second": 0, "nano": 0 }
 */
public class LocalTimeObjectDeserializer extends JsonDeserializer<LocalTime> {

    @Override
    public LocalTime deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        JsonNode node = p.getCodec().readTree(p);

        if (node.isTextual()) {
            return LocalTime.parse(node.asText());
        }

        // Extract the integers from the JSON object (sent by the frontend in UTC)
        int hour = node.has("hour") ? node.get("hour").asInt() : 0;
        int minute = node.has("minute") ? node.get("minute").asInt() : 0;
        int second = node.has("second") ? node.get("second").asInt() : 0;
        int nano = node.has("nano") ? node.get("nano").asInt() : 0;

        // 1. Create the LocalTime exactly as the frontend sent it (UTC)
        LocalTime incomingUtcTime = LocalTime.of(hour, minute, second, nano);

        // 2. Convert it back to Indian Standard Time (IST = UTC + 5:30) and return immediately
        return incomingUtcTime
                .atOffset(ZoneOffset.UTC)
                .withOffsetSameInstant(ZoneOffset.ofHoursMinutes(5, 30))
                .toLocalTime();
    }
}