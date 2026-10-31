// AutoSortBins Pro - editor module: a dockable "AutoSortBins Pro" tab hosting the shared panel UI
// (AutoSortBinsPro/ext/index.html) in Unreal's web browser. Everything else - reading the Content Browser,
// moving assets, settings and undo history - lives in the Python backend (Content/Python/asb_ue.py),
// which serves the UI on 127.0.0.1 and hands us its address through UAutoSortBinsLibrary::SetPanelUrl.

#include "AutoSortBinsLibrary.h"

#include "Modules/ModuleManager.h"
#include "Framework/Docking/TabManager.h"
#include "Widgets/Docking/SDockTab.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"
#include "WorkspaceMenuStructure.h"
#include "WorkspaceMenuStructureModule.h"
#include "SWebBrowserView.h"
#include "IWebBrowserWindow.h"
#include "WebBrowserModule.h"
#include "Styling/SlateStyle.h"
#include "Styling/SlateStyleRegistry.h"
#include "Styling/SlateStyleMacros.h"
#include "Interfaces/IPluginManager.h"
#include "AssetViewUtils.h"
#include "AssetToolsModule.h"
#include "IAssetTools.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/IAssetRegistry.h"
#include "UObject/ObjectRedirector.h"

DEFINE_LOG_CATEGORY_STATIC(LogAutoSortBins, Log, All);

#define LOCTEXT_NAMESPACE "AutoSortBinsPro"

static const FName SortTabName(TEXT("AutoSortBinsProPanel"));

namespace AutoSortBinsPanel
{
	FString Url;
	TWeakPtr<SBox> Holder;
	TWeakPtr<SWebBrowserView> Browser;
	TSharedPtr<FSlateStyleSet> Style;

	TSharedRef<SWidget> MakePlaceholder()
	{
		return SNew(SBox)
			.HAlign(HAlign_Center)
			.VAlign(VAlign_Center)
			.Padding(16.f)
			[
				SNew(STextBlock)
				.AutoWrapText(true)
				.Justification(ETextJustify::Center)
				.Text(LOCTEXT("Starting", "AutoSortBins Pro: starting the Python backend...\nIf this stays, enable the \"Python Editor Script Plugin\" and restart the editor."))
			];
	}

	TSharedRef<SWidget> MakeBrowser()
	{
		// SWebBrowser only creates a CEF window when the WebBrowser module was started through the module manager.
		IWebBrowserModule::Get();
		TSharedRef<SWebBrowserView> Web = SNew(SWebBrowserView)
			.InitialURL(Url)
			.ShowErrorMessage(true)
			.SupportsTransparency(false)
			.BackgroundColor(FColor(21, 21, 21))
			// CEF reports typing into the page's fields as "unhandled" and Unreal would replay those keys as
			// level editor shortcuts. The panel keeps them; only Ctrl+S still reaches the editor.
			.OnUnhandledKeyDown_Lambda([](const FKeyEvent& Key)
			{
				return !(Key.IsControlDown() && Key.GetKey() == EKeys::S);
			})
			.OnUnhandledKeyUp_Lambda([](const FKeyEvent& Key)
			{
				return !(Key.IsControlDown() && Key.GetKey() == EKeys::S);
			})
			.OnUnhandledKeyChar_Lambda([](const FCharacterEvent&)
			{
				return true;
			})
			.OnConsoleMessage_Lambda([](const FString& Message, const FString& Source, int32 Line, EWebBrowserConsoleLogSeverity Severity)
			{
				if (Severity >= EWebBrowserConsoleLogSeverity::Warning)
				{
					UE_LOG(LogAutoSortBins, Warning, TEXT("panel: %s (%s:%d)"), *Message, *Source, Line);
				}
			});
		Browser = Web;
		return Web;
	}

	void Rebuild()
	{
		if (TSharedPtr<SBox> Box = Holder.Pin())
		{
			Box->SetContent(Url.IsEmpty() ? MakePlaceholder() : MakeBrowser());
		}
	}

	TSharedRef<SDockTab> SpawnTab(const FSpawnTabArgs&)
	{
		TSharedRef<SBox> Box = SNew(SBox);
		Holder = Box;
		Box->SetContent(Url.IsEmpty() ? MakePlaceholder() : MakeBrowser());
		return SNew(SDockTab)
			.TabRole(ETabRole::NomadTab)
			.Label(LOCTEXT("TabTitle", "AutoSortBins Pro"))
			[
				Box
			];
	}
}

void UAutoSortBinsLibrary::SetPanelUrl(const FString& InUrl)
{
	const bool bChanged = AutoSortBinsPanel::Url != InUrl;
	AutoSortBinsPanel::Url = InUrl;
	if (TSharedPtr<SWebBrowserView> Web = AutoSortBinsPanel::Browser.Pin())
	{
		if (bChanged)
		{
			Web->LoadURL(InUrl);
		}
	}
	else
	{
		AutoSortBinsPanel::Rebuild();
	}
}

FString UAutoSortBinsLibrary::GetPanelUrl()
{
	return AutoSortBinsPanel::Url;
}

void UAutoSortBinsLibrary::OpenPanel()
{
	FGlobalTabmanager::Get()->TryInvokeTab(SortTabName);
}

void UAutoSortBinsLibrary::ReloadPanel()
{
	if (TSharedPtr<SWebBrowserView> Web = AutoSortBinsPanel::Browser.Pin())
	{
		Web->Reload();
	}
	else
	{
		AutoSortBinsPanel::Rebuild();
	}
}

void UAutoSortBinsLibrary::SetFolderColor(const FString& FolderPath, FLinearColor Color)
{
	AssetViewUtils::SetPathColor(FolderPath, TOptional<FLinearColor>(Color));
}

void UAutoSortBinsLibrary::ClearFolderColor(const FString& FolderPath)
{
	AssetViewUtils::SetPathColor(FolderPath, TOptional<FLinearColor>());
}

bool UAutoSortBinsLibrary::HasFolderColor(const FString& FolderPath)
{
	// a folder without its own colour still answers with the default one
	const TOptional<FLinearColor> Color = AssetViewUtils::GetPathColor(FolderPath);
	return Color.IsSet() && !Color->Equals(AssetViewUtils::GetDefaultColor());
}

int32 UAutoSortBinsLibrary::FixUpRedirectors(const TArray<FString>& FolderPaths)
{
	IAssetRegistry& Registry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();
	FARFilter Filter;
	Filter.bRecursivePaths = false;
	Filter.ClassPaths.Add(UObjectRedirector::StaticClass()->GetClassPathName());
	for (const FString& Path : FolderPaths)
	{
		Filter.PackagePaths.Add(FName(*Path));
	}
	TArray<FAssetData> Found;
	Registry.GetAssets(Filter, Found);

	TArray<UObjectRedirector*> Redirectors;
	for (const FAssetData& Data : Found)
	{
		if (UObjectRedirector* Redirector = Cast<UObjectRedirector>(Data.GetAsset()))
		{
			Redirectors.Add(Redirector);
		}
	}
	if (Redirectors.Num() > 0)
	{
		FAssetToolsModule::GetModule().Get().FixupReferencers(Redirectors, false, ERedirectFixupMode::DeleteFixedUpRedirectors);
	}
	return Redirectors.Num();
}

class FAutoSortBinsProModule : public IModuleInterface
{
public:
	virtual void StartupModule() override
	{
		using namespace AutoSortBinsPanel;

		IWebBrowserModule::Get();

		Style = MakeShared<FSlateStyleSet>(TEXT("AutoSortBinsProStyle"));
		if (TSharedPtr<IPlugin> Plugin = IPluginManager::Get().FindPlugin(TEXT("AutoSortBinsPro")))
		{
			Style->SetContentRoot(Plugin->GetBaseDir() / TEXT("Resources"));
		}
		Style->Set("AutoSortBinsPro.Icon", new FSlateVectorImageBrush(Style->RootToContentDir(TEXT("SortIcon"), TEXT(".svg")), FVector2D(20.f, 16.f)));
		FSlateStyleRegistry::RegisterSlateStyle(*Style);

		FGlobalTabmanager::Get()->RegisterNomadTabSpawner(SortTabName, FOnSpawnTab::CreateStatic(&SpawnTab))
			.SetDisplayName(LOCTEXT("TabTitle", "AutoSortBins Pro"))
			.SetTooltipText(LOCTEXT("TabTip", "Sort Content Browser assets into folders by type"))
			.SetGroup(WorkspaceMenu::GetMenuStructure().GetToolsCategory())
			.SetIcon(FSlateIcon(Style->GetStyleSetName(), "AutoSortBinsPro.Icon"));
	}

	virtual void ShutdownModule() override
	{
		if (FSlateApplication::IsInitialized())
		{
			FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(SortTabName);
		}
		if (AutoSortBinsPanel::Style.IsValid())
		{
			FSlateStyleRegistry::UnRegisterSlateStyle(*AutoSortBinsPanel::Style);
			AutoSortBinsPanel::Style.Reset();
		}
	}
};

IMPLEMENT_MODULE(FAutoSortBinsProModule, AutoSortBinsPro)

#undef LOCTEXT_NAMESPACE
