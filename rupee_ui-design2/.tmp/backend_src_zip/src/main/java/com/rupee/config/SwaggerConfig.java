package com.rupee.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.models.GroupedOpenApi;
import org.springdoc.core.properties.SwaggerUiConfigProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class SwaggerConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        final String securitySchemeName = "bearerAuth";

        return new OpenAPI()
                .info(new Info()
                        .title("Rupee Application REST API")
                        .description("API for Rupee Application with JWT Authentication")
                        .version("1.0")
                        .termsOfService("Terms of service")
                        .contact(new Contact().name("Rupee Support").url("http://rupee.com").email("support@rupee.com"))
                        .license(new License().name("License of API").url("API license URL")))
                .addSecurityItem(new SecurityRequirement().addList(securitySchemeName))
                .components(new Components()
                        .addSecuritySchemes(securitySchemeName, new SecurityScheme()
                                .name(securitySchemeName)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }

    @Bean
    public GroupedOpenApi publicApi() {
        return GroupedOpenApi.builder()
                .group("rupee-public")
                .packagesToScan("com.rupee.controller")
                .pathsToMatch("/**")
                .build();
    }

    @Bean
    @Primary
    public SwaggerUiConfigProperties swaggerUiConfig(SwaggerUiConfigProperties config) {
        config.setDeepLinking(true);
        config.setDisplayOperationId(false);
        config.setDefaultModelsExpandDepth(1);
        config.setDefaultModelExpandDepth(1);
        config.setDefaultModelRendering("example");
        config.setDisplayRequestDuration(false);
        config.setDocExpansion("none");
        config.setOperationsSorter("alpha");
        config.setTagsSorter("alpha");

        return config;
    }
}