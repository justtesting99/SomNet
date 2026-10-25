namespace SomNet.Device.LocalClient;

public interface ISomEspLocalSessionClientFactory
{
    ISomEspLocalSessionClient GetClient(string deviceId);
}
