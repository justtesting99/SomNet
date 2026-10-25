namespace SomNet.Device.LocalClient;

public sealed class SomEspLocalApiException : Exception
{
    public SomEspLocalApiException(
        int statusCode,
        string? deviceErrorCode,
        string message,
        Exception? innerException = null)
        : base(message, innerException)
    {
        StatusCode = statusCode;
        DeviceErrorCode = deviceErrorCode;
    }

    public int StatusCode { get; }

    /// <summary>ESP JSON error code when body is <c>{"error":"..."}</c>.</summary>
    public string? DeviceErrorCode { get; }
}
