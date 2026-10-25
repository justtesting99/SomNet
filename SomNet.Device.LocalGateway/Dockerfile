# Build context: SomNet repo root (see docker-compose.example.yml).
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY SomNet.Shared/SomNet.Shared.csproj SomNet.Shared/
COPY SomNet.Device.LocalClient/SomNet.Device.LocalClient.csproj SomNet.Device.LocalClient/
COPY SomNet.Device.LocalGateway/SomNet.Device.LocalGateway.csproj SomNet.Device.LocalGateway/

RUN dotnet restore SomNet.Device.LocalGateway/SomNet.Device.LocalGateway.csproj

COPY SomNet.Shared/ SomNet.Shared/
COPY SomNet.Device.LocalClient/ SomNet.Device.LocalClient/
COPY SomNet.Device.LocalGateway/ SomNet.Device.LocalGateway/

RUN dotnet publish SomNet.Device.LocalGateway/SomNet.Device.LocalGateway.csproj \
    -c Release \
    -o /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

EXPOSE 5290

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5290/health || exit 1

ENTRYPOINT ["dotnet", "SomNet.Device.LocalGateway.dll"]
