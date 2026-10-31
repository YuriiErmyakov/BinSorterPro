using UnrealBuildTool;

public class AutoSortBinsPro : ModuleRules
{
	public AutoSortBinsPro(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine" });
		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate", "SlateCore", "InputCore", "UnrealEd", "ToolMenus", "WorkspaceMenuStructure",
			"WebBrowser", "Projects", "AssetTools", "AssetRegistry"
		});
	}
}
